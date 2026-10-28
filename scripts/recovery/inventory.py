"""Read-only, fail-closed inventory of the Maevelle rootless staging boundary."""

import json
import hashlib
import os
import pwd
import re
import shutil
import stat
import subprocess
from pathlib import Path

from staging.host import CONTAINERS, HOME, QUADLETS, UNITS
from staging.manifest import SERVICES, validate as validate_release
from staging.quadlet import fields, has_volume, inspect

EXPECTED_UID = 1001
NETWORK = "maevelle-staging"
VOLUMES = {"postgres": "maevelle-staging-postgres", "media": "maevelle-staging-media"}
DESTINATIONS = {"postgres": "/var/lib/postgresql", "media": "/app/var/media"}
QUERY = r"""
const { Pool } = require('pg');
(async () => {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== 'maevelle-staging-postgres' || url.pathname !== '/maevelle_staging')
    throw Error('target');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1,
    connectionTimeoutMillis: 3000, query_timeout: 3000 });
  try {
    const db = await pool.query("select current_database() name, current_setting('server_version') version, (select count(*)::int from public.kysely_migration) migrations");
    const ext = await pool.query("select extname from pg_extension where extname in ('pg_trgm','pg_stat_statements') order by extname");
    process.stdout.write(JSON.stringify({ ...db.rows[0], extensions: ext.rows.map(r => r.extname) }));
  } finally { await pool.end(); }
})().catch(() => { console.error('MAEVELLE_INVENTORY_QUERY_FAILED'); process.exit(1); });
"""


def safe_path(path: Path, root: Path, *, allow_missing=False) -> Path:
    """Refuse traversal/symlinks before any read or directory walk."""
    if not path.is_absolute() or not root.is_absolute() or ".." in path.parts or ".." in root.parts:
        raise ValueError("Unsafe Maevelle path")
    if path != root and root not in path.parents:
        raise ValueError("Path escapes Maevelle boundary")
    candidates = [root]
    current = root
    for part in path.relative_to(root).parts:
        current = current / part
        candidates.append(current)
    for candidate in candidates:
        if candidate.is_symlink():
            raise ValueError("Symlink in Maevelle path")
    if not allow_missing and not path.exists():
        raise ValueError("Required Maevelle path missing")
    return path


def _regular_private(path: Path, uid: int) -> dict:
    safe_path(path, HOME)
    info = path.stat(follow_symlinks=False)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError("Maevelle secret file ownership or permissions invalid")
    return {"present": True, "ownerUid": info.st_uid, "mode": oct(stat.S_IMODE(info.st_mode))}


def _count_media(root: Path) -> tuple[int, int]:
    count = size = 0
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    pending = [os.open(root, flags)]
    try:
        while pending:
            current = pending.pop()
            try:
                with os.scandir(current) as entries:
                    for entry in entries:
                        info = entry.stat(follow_symlinks=False)
                        if stat.S_ISDIR(info.st_mode):
                            pending.append(os.open(entry.name, flags, dir_fd=current))
                        elif stat.S_ISREG(info.st_mode):
                            count += 1
                            size += info.st_size
                        else:
                            raise ValueError("Unexpected media volume entry")
            finally:
                os.close(current)
    finally:
        for descriptor in pending:
            os.close(descriptor)
    return count, size


class Reader:
    def run(self, *args: str) -> str:
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=20, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise ValueError("Inventory command unavailable or timed out") from None
        if result.returncode:
            raise ValueError("Inventory read-only probe failed")
        return result.stdout.strip()


def _json(raw: str, label: str):
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        raise ValueError(f"Malformed {label} inventory response") from None


def host_fingerprint(path: Path = Path("/etc/machine-id")) -> str:
    value = path.read_text(encoding="ascii").strip().lower()
    if not re.fullmatch(r"[a-f0-9]{32}", value):
        raise ValueError("Host identity unavailable")
    return hashlib.sha256(f"maevelle-staging:{value}".encode("ascii")).hexdigest()[:32]


def _mount(mounts, volume: str, destination: str):
    if not isinstance(mounts, list):
        raise ValueError("Malformed container mounts")
    found = [item for item in mounts if isinstance(item, dict) and item.get("Destination") == destination]
    if len(found) != 1 or found[0].get("Type") != "volume" or found[0].get("Name") != volume:
        raise ValueError("Unexpected Maevelle container volume mount")
    source = found[0].get("Source")
    if not isinstance(source, str) or not source.startswith("/"):
        raise ValueError("Maevelle container mount source missing")
    return source


def collect(reader: Reader | None = None, *, home: Path = HOME, uid: int | None = None, username: str | None = None, host_id: str | None = None) -> dict:
    """Collect bounded identity facts. No writes, env values, DB rows or broad host listing."""
    reader = reader or Reader()
    uid = os.geteuid() if uid is None else uid
    username = pwd.getpwuid(uid).pw_name if username is None else username
    if home != HOME or uid != EXPECTED_UID or username != "maevelle":
        raise ValueError("Inventory requires rootless maevelle UID 1001")
    host_id = host_fingerprint() if host_id is None else host_id
    if not re.fullmatch(r"[a-f0-9]{32}", host_id):
        raise ValueError("Host fingerprint invalid")
    if reader.run("podman", "info", "--format", "{{.Host.Security.Rootless}}") != "true":
        raise ValueError("Podman is not rootless")
    version = reader.run("podman", "version", "--format", "{{.Client.Version}}")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Malformed Podman version")
    network = _json(reader.run("podman", "network", "inspect", NETWORK), "network")
    if not isinstance(network, list) or len(network) != 1 or not isinstance(network[0], dict) or network[0].get("name", network[0].get("Name")) != NETWORK or network[0].get("driver", network[0].get("Driver")) != "bridge":
        raise ValueError("Maevelle staging network identity mismatch")
    quadlets = {}
    states = {}
    mount_sources = {}
    for name in CONTAINERS:
        path = safe_path(QUADLETS[name], HOME)
        if path.stat(follow_symlinks=False).st_uid != uid:
            raise ValueError("Maevelle Quadlet ownership mismatch")
        content, image = inspect(path, CONTAINERS[name])
        values = fields(content)
        if name in VOLUMES and not has_volume(values, path.parent, VOLUMES[name], (f"maevelle-{name}.volume", f"{VOLUMES[name]}.volume")):
            raise ValueError("Maevelle Quadlet volume identity mismatch")
        if name == "api" and not has_volume(values, path.parent, VOLUMES["media"], ("maevelle-media.volume", "maevelle-staging-media.volume")):
            raise ValueError("Maevelle media Quadlet mount missing")
        if name == "caddy" and values.get("PublishPort") != ["127.0.0.1:18080:80"]:
            raise ValueError("Maevelle Caddy listener mismatch")
        quadlets[name] = {"unit": UNITS[name], "container": CONTAINERS[name], "image": image}
        state = reader.run("systemctl", "--user", "show", UNITS[name], "--property=ActiveState", "--value")
        if state not in ("active", "inactive", "failed", "activating", "deactivating"):
            raise ValueError("Malformed service state")
        states[name] = state
        data = _json(reader.run("podman", "inspect", CONTAINERS[name]), "container")
        if not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], dict) or data[0].get("Name") != CONTAINERS[name]:
            raise ValueError("Maevelle container identity mismatch")
        if name in SERVICES:
            if data[0].get("ImageName") != image:
                raise ValueError("Running application image differs from Quadlet")
        network_settings = data[0].get("NetworkSettings")
        if not isinstance(network_settings, dict):
            raise ValueError("Malformed container network settings")
        attachments = network_settings.get("Networks")
        if not isinstance(attachments, dict) or set(attachments) != {NETWORK}:
            raise ValueError("Maevelle container network attachment mismatch")
        if name in VOLUMES:
            mount_sources[name] = _mount(data[0].get("Mounts"), VOLUMES[name], DESTINATIONS[name])
        if name == "api":
            mount_sources["media"] = _mount(data[0].get("Mounts"), VOLUMES["media"], DESTINATIONS["media"])
    volumes = {}
    for name, volume in VOLUMES.items():
        data = _json(reader.run("podman", "volume", "inspect", volume), "volume")
        if not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], dict) or data[0].get("Name") != volume:
            raise ValueError("Maevelle volume identity mismatch")
        mountpoint = data[0].get("Mountpoint")
        if not isinstance(mountpoint, str):
            raise ValueError("Maevelle volume mountpoint missing")
        path = safe_path(Path(mountpoint), HOME)
        if path.parts[-2:] != (volume, "_data") or mount_sources[name] != str(path):
            raise ValueError("Maevelle volume mountpoint identity mismatch")
        free = shutil.disk_usage(path).free
        volumes[name] = {"name": volume, "mountpoint": str(path), "ownerUid": path.stat(follow_symlinks=False).st_uid, "freeBytes": free}
    try:
        media_count, media_bytes = _count_media(Path(volumes["media"]["mountpoint"]))
        media = {"readable": True, "fileCount": media_count, "totalBytes": media_bytes}
    except PermissionError:
        media = {"readable": False, "reason": "permission-denied"}
    env_file = HOME / "deployment/secrets/staging.env"
    config_file = HOME / "deployment/config/Caddyfile"
    protected = {"stagingEnv": _regular_private(env_file, uid)}
    safe_path(config_file, HOME)
    config_stat = config_file.stat(follow_symlinks=False)
    if not stat.S_ISREG(config_stat.st_mode) or config_stat.st_uid != uid or stat.S_IMODE(config_stat.st_mode) & 0o022:
        raise ValueError("Maevelle Caddy configuration missing or unowned")
    protected["caddyConfig"] = {"present": True, "ownerUid": uid, "mode": oct(stat.S_IMODE(config_stat.st_mode))}
    # Parse only a non-secret sentinel if present; never copy values into output.
    sentinel = None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith("STAGING_ENVIRONMENT="):
            if sentinel is not None:
                raise ValueError("Duplicate staging sentinel")
            sentinel = line.split("=", 1)[1].strip().strip('"\'')
    if sentinel is not None and sentinel != "staging":
        raise ValueError("Incorrect staging environment sentinel")
    backup_dir = HOME / "deployment/backups"
    safe_path(backup_dir, HOME, allow_missing=True)
    if backup_dir.exists():
        metadata = backup_dir.stat(follow_symlinks=False)
        if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != uid or stat.S_IMODE(metadata.st_mode) & 0o077:
            raise ValueError("Backup directory ownership or permissions invalid")
        with os.scandir(backup_dir) as entries:
            children = list(entries)
        if any(child.is_symlink() for child in children):
            raise ValueError("Symlink in Maevelle backup directory")
        backups = {"present": True, "ownerUid": uid, "mode": oct(stat.S_IMODE(metadata.st_mode)), "entryCount": len(children), "freeBytes": shutil.disk_usage(backup_dir).free}
    else:
        backups = {"present": False}
    record_path = HOME / "deployment/releases/current.json"
    safe_path(record_path, HOME)
    record_stat = record_path.stat(follow_symlinks=False)
    if not stat.S_ISREG(record_stat.st_mode) or record_stat.st_uid != uid or stat.S_IMODE(record_stat.st_mode) & 0o077:
        raise ValueError("Release record ownership or permissions invalid")
    record = _json(record_path.read_text(encoding="utf-8"), "release record")
    if not isinstance(record, dict):
        raise ValueError("Malformed release record")
    manifest = validate_release(record.get("manifest"))
    if record.get("outcome") != "verified":
        raise ValueError("Release record is not verified")
    release = {"present": True, "commitSha": manifest["commitSha"], "imageRefs": {n: manifest["images"][n]["ref"] for n in SERVICES}}
    if any(quadlets[n]["image"] != release["imageRefs"][n] for n in SERVICES):
        raise ValueError("Recorded and running application release differs")
    db = _json(reader.run("podman", "exec", "--workdir", "/app/packages/database", CONTAINERS["api"], "node", "-e", QUERY), "database")
    if not isinstance(db, dict) or db.get("name") != "maevelle_staging" or not isinstance(db.get("version"), str) or not db["version"].startswith("18.") or type(db.get("migrations")) is not int or db["migrations"] < 51 or db.get("extensions") != ["pg_stat_statements", "pg_trgm"]:
        raise ValueError("Maevelle PostgreSQL database identity mismatch")
    tools = {}
    for tool in ("psql", "pg_dump", "pg_restore"):
        output = reader.run("podman", "exec", CONTAINERS["postgres"], tool, "--version")
        match = re.search(r"\b18(?:\.\d+)?\b", output)
        if not match:
            raise ValueError("PostgreSQL 18 client tool unavailable")
        tools[tool] = match.group(0)
    return {
        "identity": {"environment": "staging", "hostId": host_id, "sentinelPresent": sentinel == "staging", "linuxUser": username, "uid": uid, "rootless": True, "podmanVersion": version},
        "network": {"name": NETWORK, "driver": "bridge"}, "quadlets": quadlets, "serviceStates": states,
        "database": db, "volumes": volumes, "media": media,
        "backupDirectory": backups, "releaseRecord": release, "configFiles": protected, "postgresTools": tools,
        "prerequisites": {"explicitSentinel": sentinel == "staging", "offHostStorage": "unknown", "secretKeyCustody": "unknown", "isolatedRestore": "unverified"},
    }
