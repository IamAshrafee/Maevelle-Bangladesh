"""Maevelle-only PostgreSQL/media capture with a verified writer boundary."""

import hashlib
import json
import os
import secrets
import signal
import shutil
import stat
import subprocess
import tarfile
import tempfile
import urllib.request
from datetime import datetime, timezone
from contextlib import contextmanager
from pathlib import Path

from recovery.contract import ledger_hash, transition, validate
from recovery.inventory import CONTAINERS, HOME, NETWORK, _count_media
from recovery.safety import BACKUP_ROOT, RECIPIENTS_PATH, backup_root, load_configuration, recovery_lock
from recovery.storage import MountedStorage, digest
from staging.manifest import SERVICES

DATABASE = "maevelle_staging"
PG_CONTAINER = CONTAINERS["postgres"]
WRITERS = ("worker", "api")
ALLOWED_ACTIVE = {CONTAINERS[name] for name in ("postgres", "caddy", "admin", "storefront")}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_set_id() -> str:
    return f"mvl-stg-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{secrets.token_hex(8)}"


@contextmanager
def interrupt_cleanup():
    previous = signal.getsignal(signal.SIGTERM)
    def interrupt(_number, _frame):
        raise InterruptedError("Recovery capture interrupted")
    signal.signal(signal.SIGTERM, interrupt)
    try:
        yield
    finally:
        signal.signal(signal.SIGTERM, previous)


def _write_json(path: Path, value: dict) -> None:
    if path.exists() or path.is_symlink():
        raise ValueError("Recovery artifact already exists")
    with path.open("xb") as output:
        os.fchmod(output.fileno(), 0o600)
        output.write((json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8"))
        output.flush()
        os.fsync(output.fileno())


class CaptureDriver:
    """Narrow command allowlist. Errors never include captured stderr or environment."""

    def run(self, *args: str, stdin=None, stdout=None, timeout=300) -> str:
        result = subprocess.run(args, stdin=stdin, stdout=stdout if stdout is not None else subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, check=False)
        if result.returncode:
            raise ValueError(f"Maevelle recovery probe failed: {args[0]} {args[1] if len(args) > 1 else ''}")
        return "" if stdout is not None else result.stdout.decode("utf-8", errors="strict").strip()

    def sql(self, query: str) -> str:
        return self.run("podman", "exec", PG_CONTAINER, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                        "-U", "maevelle_staging", "-d", DATABASE, "-c", query)

    def preflight(self, snapshot: dict) -> tuple[str, int]:
        identity = self.sql("select current_database() || '|' || current_user || '|' || current_setting('server_version')")
        parts = identity.split("|")
        if len(parts) != 3 or parts[0] != DATABASE or parts[1] != "maevelle_staging" or parts[2] != snapshot["database"]["version"]:
            raise ValueError("PostgreSQL database, role or version differs from inventory")
        client = self.run("podman", "exec", PG_CONTAINER, "pg_dump", "--version")
        if not client.endswith(snapshot["postgresTools"]["pg_dump"]):
            raise ValueError("PostgreSQL dump client version differs from inventory")
        size = self.sql("select pg_database_size(current_database())")
        if not size.isdigit():
            raise ValueError("PostgreSQL database size response invalid")
        return parts[2], int(size)

    def ledger(self) -> list[str]:
        names = self.sql("select name from public.kysely_migration order by name").splitlines()
        if len(names) < 51 or names != sorted(set(names)):
            raise ValueError("Migration ledger invalid")
        return names

    def client_sessions(self) -> int:
        count = self.sql("select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend'")
        if not count.isdigit():
            raise ValueError("PostgreSQL session probe invalid")
        return int(count)

    def service_state(self, name: str) -> str:
        state = self.run("systemctl", "--user", "show", f"maevelle-{name}.service", "--property=ActiveState", "--value")
        if state not in ("active", "inactive", "failed", "activating", "deactivating"):
            raise ValueError("Maevelle service state invalid")
        return state

    def container_running(self, name: str) -> bool:
        value = self.run("podman", "inspect", "--format", "{{.State.Running}}", CONTAINERS[name])
        if value not in ("true", "false"):
            raise ValueError("Maevelle container state invalid")
        return value == "true"

    def active_network_containers(self) -> set[str]:
        raw = self.run("podman", "ps", "--filter", f"network={NETWORK}", "--format", "{{.Names}}")
        names = set(raw.splitlines()) if raw else set()
        if any(not name.startswith("maevelle-staging-") for name in names):
            raise ValueError("Unexpected container on Maevelle network")
        return names

    def worker_media_mount(self, mountpoint: str) -> None:
        raw = self.run("podman", "inspect", "--format", "{{json .Mounts}}", CONTAINERS["worker"])
        try:
            mounts = json.loads(raw)
        except ValueError:
            raise ValueError("Worker media mount response invalid") from None
        matches = [m for m in mounts if isinstance(m, dict) and m.get("Destination") == "/app/var/media"] if isinstance(mounts, list) else []
        if len(matches) != 1 or matches[0].get("Name") != "maevelle-staging-media" or matches[0].get("Source") != mountpoint:
            raise ValueError("Worker does not share the persistent Maevelle media volume")

    def local_media_backend(self) -> None:
        env_file = HOME / "deployment/secrets/staging.env"
        values = {}
        for line in env_file.read_text(encoding="utf-8").splitlines():
            for key in ("MEDIA_STORAGE_PROVIDER", "MEDIA_STORAGE_PATH"):
                if line.startswith(key + "="):
                    if key in values:
                        raise ValueError("Ambiguous Maevelle media configuration")
                    values[key] = line.split("=", 1)[1].strip().strip("\"'")
        if values.get("MEDIA_STORAGE_PROVIDER", "local") != "local" or values.get("MEDIA_STORAGE_PATH") != "/app/var/media":
            raise ValueError("Coordinated local-media capture requires the exact persistent media backend")

    def stop(self, name: str) -> None:
        self.run("systemctl", "--user", "stop", f"maevelle-{name}.service")
        if self.service_state(name) != "inactive" or self.container_running(name):
            raise ValueError("Maevelle writer did not stop cleanly")
        result = self.run("systemctl", "--user", "show", f"maevelle-{name}.service", "--property=Result", "--value")
        if result != "success":
            raise ValueError("Maevelle writer shutdown was not clean")

    def start(self, name: str) -> None:
        self.run("systemctl", "--user", "start", f"maevelle-{name}.service")
        if self.service_state(name) != "active" or not self.container_running(name):
            raise ValueError("Maevelle writer did not return to active state")

    def verify_available(self) -> None:
        if any(self.service_state(name) != "active" or not self.container_running(name) for name in WRITERS):
            raise ValueError("Maevelle writers are not active after capture")
        try:
            with urllib.request.urlopen("http://127.0.0.1:18080/api/health/ready", timeout=5) as response:
                if response.status != 200:
                    raise ValueError("Maevelle API readiness did not recover")
        except (OSError, ValueError):
            raise ValueError("Maevelle API readiness did not recover") from None

    def dump(self, destination: Path) -> None:
        with destination.open("xb") as output:
            os.fchmod(output.fileno(), 0o600)
            self.run("podman", "exec", PG_CONTAINER, "pg_dump", "--username=maevelle_staging",
                     "--dbname=maevelle_staging", "--format=custom", "--lock-wait-timeout=10000", stdout=output, timeout=1800)
            output.flush()
            os.fsync(output.fileno())

    def inspect_dump(self, source: Path) -> None:
        with source.open("rb") as archive:
            listing = self.run("podman", "exec", "-i", PG_CONTAINER, "pg_restore", "--list", stdin=archive)
        if "TABLE" not in listing or "kysely_migration" not in listing:
            raise ValueError("PostgreSQL custom archive structure invalid")

    def encrypt(self, source: Path, destination: Path) -> None:
        if destination.exists():
            raise ValueError("Encrypted artifact already exists")
        self.run("age", "-R", str(RECIPIENTS_PATH), "-o", str(destination), str(source), timeout=1800)
        if not destination.is_file() or destination.stat().st_size == 0:
            raise ValueError("Encrypted recovery artifact missing")
        destination.chmod(0o600)


def _media_tar(root: Path, destination: Path) -> tuple[int, int]:
    """Use no-follow descriptors so a media symlink cannot escape the volume."""
    count = size = 0
    flags = os.O_RDONLY | os.O_NOFOLLOW
    with destination.open("xb") as output:
        os.fchmod(output.fileno(), 0o600)
        with tarfile.open(fileobj=output, mode="w") as archive:
            pending = [(os.open(root, flags | os.O_DIRECTORY), "")]
            try:
                while pending:
                    directory_fd, prefix = pending.pop()
                    try:
                        with os.scandir(directory_fd) as entries:
                            for entry in sorted(entries, key=lambda item: item.name):
                                info = entry.stat(follow_symlinks=False)
                                name = f"{prefix}{entry.name}"
                                if stat.S_ISDIR(info.st_mode):
                                    pending.append((os.open(entry.name, flags | os.O_DIRECTORY, dir_fd=directory_fd), name + "/"))
                                elif stat.S_ISREG(info.st_mode):
                                    fd = os.open(entry.name, flags, dir_fd=directory_fd)
                                    try:
                                        file_info = os.fstat(fd)
                                        if not stat.S_ISREG(file_info.st_mode) or file_info.st_ino != info.st_ino or file_info.st_size != info.st_size:
                                            raise ValueError("Media changed during capture")
                                        tar_info = tarfile.TarInfo(name)
                                        tar_info.size = file_info.st_size
                                        tar_info.mode = 0o600
                                        tar_info.mtime = 0
                                        with os.fdopen(fd, "rb", closefd=False) as source:
                                            archive.addfile(tar_info, source)
                                        count += 1
                                        size += file_info.st_size
                                    finally:
                                        os.close(fd)
                                else:
                                    raise ValueError("Unsafe media volume entry")
                    finally:
                        os.close(directory_fd)
            finally:
                for fd, _ in pending:
                    os.close(fd)
        output.flush()
        os.fsync(output.fileno())
    return count, size


def _candidate(kind: str, set_id: str, snapshot: dict, names: list[str], started: str, key_id: str) -> dict:
    limitations = ["no-point-in-time-recovery", "external-effects-not-reversed"]
    if kind == "database-only":
        limitations.append("database-only-no-media")
    value = {
        "formatVersion": 1, "recoverySetId": set_id, "kind": kind, "state": "candidate",
        "stateHistory": [{"state": "candidate", "at": started}],
        "environment": {"name": "staging", "hostId": snapshot["identity"]["hostId"], "linuxUser": "maevelle", "uid": 1001,
                        "network": NETWORK, "postgresContainer": PG_CONTAINER, "postgresVolume": "maevelle-staging-postgres", "mediaVolume": "maevelle-staging-media"},
        "capture": {"startedAt": started, "completedAt": None},
        "database": {"name": DATABASE, "serverVersion": snapshot["database"]["version"], "clientVersion": snapshot["postgresTools"]["pg_dump"]},
        "artifacts": {"database": None, "media": None},
        "release": {"commitSha": snapshot["releaseRecord"]["commitSha"], "images": snapshot["releaseRecord"]["imageRefs"]},
        "migrations": {"names": names, "sha256": ledger_hash(names)},
        "mediaExpected": {"objectCount": 0, "totalBytes": 0},
        "consistency": {"mode": "quiesced" if kind == "coordinated" else "online", "writersStopped": False,
                        "startedAt": None, "endedAt": None, "ledgerBeforeSha256": None, "ledgerAfterSha256": None, "evidenceSha256": None},
        "encryption": {"method": "age", "keyId": key_id}, "offHost": None,
        "verification": {"integrity": None, "restore": None},
        "recoveryPoint": {"databaseAt": None, "mediaAt": None, "limitations": limitations},
    }
    return validate(value)


def plan(snapshot: dict, config: dict, kind: str) -> dict:
    if kind not in ("database-only", "coordinated"):
        raise ValueError("Invalid recovery capture kind")
    if snapshot["identity"]["sentinelPresent"] is not True or snapshot["identity"]["hostId"] != config["hostId"]:
        raise ValueError("Staging identity prerequisite missing")
    if snapshot["releaseRecord"]["commitSha"] != config["releaseCommit"]:
        raise ValueError("Deployed release changed since recovery approval")
    if kind == "coordinated" and snapshot["media"].get("readable") is not True:
        raise ValueError("Media volume cannot be safely read")
    fields = {"kind": kind, "hostId": config["hostId"], "releaseCommit": config["releaseCommit"],
              "database": DATABASE, "postgresVolume": "maevelle-staging-postgres", "mediaVolume": "maevelle-staging-media",
              "migrationCount": snapshot["database"]["migrations"], "media": snapshot["media"],
              "keyId": config["keyId"], "storageProvider": config["storage"]["provider"],
              "serviceImpact": list(WRITERS) if kind == "coordinated" else []}
    fields["planId"] = hashlib.sha256(json.dumps(fields, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return fields


def _cleanup_candidate(path: Path) -> None:
    if not path.exists():
        return
    if path.is_symlink() or not path.name.startswith(".candidate-mvl-stg-"):
        raise ValueError("Unsafe interrupted capture directory")
    allowed = {"database.dump.age", "media.tar.age", "quiescence.json", "manifest.json"}
    children = list(path.iterdir())
    if any(child.is_symlink() or not child.is_file() or child.name not in allowed for child in children):
        raise ValueError("Interrupted capture contains unexpected files; operator review required")
    for child in children:
        child.unlink()
    path.rmdir()


def capture(kind: str, confirmation: str, inventory_provider, driver: CaptureDriver | None = None,
            storage_factory=MountedStorage) -> dict:
    driver = driver or CaptureDriver()
    with interrupt_cleanup(), recovery_lock():
        snapshot = inventory_provider()
        config = load_configuration(snapshot)
        current_plan = plan(snapshot, config, kind)
        if confirmation != current_plan["planId"]:
            raise ValueError("Capture requires exact current plan ID confirmation")
        storage_factory(Path(config["storage"]["root"]))
        if shutil.which("age") is None:
            raise ValueError("age encryption tool is unavailable")
        _, database_bytes = driver.preflight(snapshot)
        names = driver.ledger()
        if len(names) != snapshot["database"]["migrations"]:
            raise ValueError("Migration ledger differs from inventory")
        root = backup_root(create=True)
        size_estimate = database_bytes + (snapshot["media"].get("totalBytes", 0) if kind == "coordinated" else 0)
        if shutil.disk_usage(root).free < 3 * size_estimate + 256 * 1024 * 1024:
            raise ValueError("Insufficient Maevelle backup disk space")
        if shutil.disk_usage(f"/run/user/{os.geteuid()}").free < size_estimate + 64 * 1024 * 1024:
            raise ValueError("Insufficient private runtime space for capture")
        set_id = new_set_id()
        staging_dir = root / f".candidate-{set_id}"
        staging_dir.mkdir(mode=0o700)
        stopped = []
        quiesced_at = None
        evidence = {}
        try:
            captured = None
            try:
                if kind == "coordinated":
                    driver.local_media_backend()
                    driver.worker_media_mount(snapshot["volumes"]["media"]["mountpoint"])
                    for name in WRITERS:
                        if driver.service_state(name) != "active":
                            raise ValueError("Maevelle writer was not active before capture")
                        stopped.append(name)  # A stop can succeed before its postcondition probe fails.
                        driver.stop(name)
                    if driver.client_sessions() != 0 or driver.active_network_containers() != ALLOWED_ACTIVE:
                        raise ValueError("Maevelle writer quiescence cannot be proven")
                    media_root = Path(snapshot["volumes"]["media"]["mountpoint"])
                    if _count_media(media_root) != (snapshot["media"]["fileCount"], snapshot["media"]["totalBytes"]):
                        raise ValueError("Maevelle media changed since the confirmed inventory plan")
                    quiesced_at = utc_now()
                    evidence = {"writerServicesStopped": list(WRITERS), "clientSessions": 0,
                                "activeNetworkContainers": sorted(ALLOWED_ACTIVE), "quiescedAt": quiesced_at}
                started = utc_now()
                candidate = _candidate(kind, set_id, snapshot, names, started, config["keyId"])
                with tempfile.TemporaryDirectory(prefix="maevelle-recovery-", dir=f"/run/user/{os.geteuid()}") as temp_name:
                    temp = Path(temp_name)
                    plain_dump = temp / "database.dump"
                    driver.dump(plain_dump)
                    driver.inspect_dump(plain_dump)
                    driver.encrypt(plain_dump, staging_dir / "database.dump.age")
                    plain_dump.unlink()
                    media_counts = (0, 0)
                    if kind == "coordinated":
                        plain_media = temp / "media.tar"
                        media_counts = _media_tar(media_root, plain_media)
                        driver.encrypt(plain_media, staging_dir / "media.tar.age")
                        plain_media.unlink()
                        if media_counts != _count_media(media_root) or driver.client_sessions() != 0 or driver.active_network_containers() != ALLOWED_ACTIVE:
                            raise ValueError("Maevelle media or writer state changed during capture")
                after = driver.ledger()
                if after != names:
                    raise ValueError("Migration ledger changed during capture")
                ended = utc_now()
                if kind == "coordinated":
                    evidence.update({"captureCompletedAt": ended, "ledgerSha256": ledger_hash(names),
                                     "mediaFileCount": media_counts[0], "mediaTotalBytes": media_counts[1]})
                    _write_json(staging_dir / "quiescence.json", evidence)
                captured = transition(candidate, "captured", ended, {
                    "capture": {"startedAt": started, "completedAt": ended},
                    "artifacts": {"database": {"name": "database.dump.age", "sizeBytes": (staging_dir / "database.dump.age").stat().st_size,
                                               "sha256": digest(staging_dir / "database.dump.age")},
                                  "media": {"name": "media.tar.age", "sizeBytes": (staging_dir / "media.tar.age").stat().st_size,
                                            "sha256": digest(staging_dir / "media.tar.age")} if kind == "coordinated" else None},
                    "mediaExpected": {"objectCount": media_counts[0], "totalBytes": media_counts[1]},
                    "consistency": {"mode": "quiesced" if kind == "coordinated" else "online", "writersStopped": kind == "coordinated",
                                    "startedAt": quiesced_at, "endedAt": ended if kind == "coordinated" else None,
                                    "ledgerBeforeSha256": ledger_hash(names), "ledgerAfterSha256": ledger_hash(after),
                                    "evidenceSha256": digest(staging_dir / "quiescence.json") if kind == "coordinated" else None},
                    "recoveryPoint": {"databaseAt": started, "mediaAt": ended if kind == "coordinated" else None,
                                      "limitations": candidate["recoveryPoint"]["limitations"]},
                })
            finally:
                signal_handler = signal.getsignal(signal.SIGTERM)
                signal.signal(signal.SIGTERM, signal.SIG_IGN)
                failures = []
                try:
                    for name in reversed(stopped):
                        try:
                            driver.start(name)
                        except Exception:
                            failures.append(name)
                    if stopped and not failures:
                        try:
                            driver.verify_available()
                        except Exception:
                            failures.append("readiness")
                finally:
                    signal.signal(signal.SIGTERM, signal_handler)
                if failures:
                    raise ValueError("Maevelle service availability restoration failed; inspect scoped units")
            if captured is None:
                raise ValueError("Recovery capture did not complete")
            _write_json(staging_dir / "manifest.json", captured)
            directory_fd = os.open(staging_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            staging_dir.rename(root / set_id)
            return {"recoverySetId": set_id, "state": "captured", "kind": kind,
                    "releaseCommit": captured["release"]["commitSha"]}
        finally:
            _cleanup_candidate(staging_dir)
