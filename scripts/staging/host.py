import json
import os
import pwd
import stat
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from .manifest import SERVICES
from .quadlet import fields, has_volume, inspect

HOME = Path("/home/maevelle")
QUADLET_DIR = HOME / ".config/containers/systemd"
DEPLOY_DIR = HOME / "deployment"
ENV_FILE = DEPLOY_DIR / "secrets/staging.env"
CADDY_FILE = DEPLOY_DIR / "config/Caddyfile"
CONTAINERS = {name: f"maevelle-staging-{name}" for name in (*SERVICES, "postgres", "caddy")}
UNITS = {name: f"maevelle-{name}.service" for name in CONTAINERS}
QUADLETS = {name: QUADLET_DIR / f"maevelle-{name}.container" for name in CONTAINERS}

LEDGER_SCRIPT = r"""
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const rows = await pool.query('select name from public.kysely_migration order by name');
    process.stdout.write(JSON.stringify(rows.rows.map(row => row.name)));
  } finally { await pool.end(); }
})().catch(() => { console.error('Migration ledger read failed'); process.exit(1); });
"""


class Host:
    def __init__(self, home: Path = HOME):
        self.home = home
        self.quadlets = {name: home / ".config/containers/systemd" / f"maevelle-{name}.container" for name in CONTAINERS}
        self.deploy = home / "deployment"

    def run(self, *args: str, timeout: int = 30) -> str:
        result = subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)
        if result.returncode:
            # Do not echo stderr from commands that may handle protected env.
            raise RuntimeError(f"{' '.join(args[:2])} failed (exit {result.returncode})")
        return result.stdout.strip()

    def verify_identity(self) -> None:
        if pwd.getpwuid(os.geteuid()).pw_name != "maevelle" or self.home != HOME:
            raise RuntimeError("Run only as rootless maevelle with /home/maevelle")
        if self.run("podman", "info", "--format", "{{.Host.Security.Rootless}}") != "true":
            raise RuntimeError("Podman is not rootless")
        self.run("podman", "network", "exists", "maevelle-staging")
        networks = json.loads(self.run("podman", "network", "inspect", "maevelle-staging"))
        if not isinstance(networks, list) or len(networks) != 1 or not isinstance(networks[0], dict) or networks[0].get("name", networks[0].get("Name")) != "maevelle-staging" or networks[0].get("driver", networks[0].get("Driver")) != "bridge":
            raise RuntimeError("Podman network identity or driver differs from Maevelle staging")
        env_file = self.deploy / "secrets/staging.env"
        if env_file.is_symlink() or not env_file.is_file() or env_file.stat().st_uid != os.geteuid() or stat.S_IMODE(env_file.stat().st_mode) & 0o077:
            raise RuntimeError("Protected Maevelle staging.env identity or permissions are invalid")
        if not (self.deploy / "config/Caddyfile").is_file():
            raise RuntimeError("Maevelle Caddyfile is missing")
        for name, path in self.quadlets.items():
            if path.is_symlink() or path.stat().st_uid != os.geteuid():
                raise RuntimeError(f"Maevelle {name} Quadlet ownership or type is invalid")
            text, _ = inspect(path, CONTAINERS[name])
            values = fields(text)
            if name == "postgres" and not has_volume(values, path.parent, "maevelle-staging-postgres", ("maevelle-postgres.volume", "maevelle-staging-postgres.volume")):
                raise RuntimeError("PostgreSQL Quadlet does not declare Maevelle's persistent volume")
            if name == "api" and not has_volume(values, path.parent, "maevelle-staging-media", ("maevelle-media.volume", "maevelle-staging-media.volume")):
                raise RuntimeError("API Quadlet does not declare Maevelle's persistent media volume")
            if name == "caddy" and "127.0.0.1:18080:80" not in values.get("PublishPort", []):
                raise RuntimeError("Caddy listener is not restricted to 127.0.0.1:18080")
        for name in CONTAINERS:
            self.run("podman", "container", "exists", CONTAINERS[name])
            if self.run("podman", "inspect", "--format", "{{.State.Running}}", CONTAINERS[name]) != "true":
                raise RuntimeError(f"Maevelle {name} container is not running")
            attachments = json.loads(self.run("podman", "inspect", "--format", "{{json .NetworkSettings.Networks}}", CONTAINERS[name]))
            if not isinstance(attachments, dict) or set(attachments) != {"maevelle-staging"}:
                raise RuntimeError(f"Maevelle {name} container network attachment differs from staging")

    def service_states(self) -> dict[str, str]:
        states = {}
        for name, unit in UNITS.items():
            # is-active exits nonzero for an inactive unit; status remains informative.
            result = subprocess.run(["systemctl", "--user", "is-active", unit], text=True, capture_output=True, check=False)
            states[name] = result.stdout.strip() or "unknown"
        return states

    def container_refs(self) -> dict[str, str]:
        return {
            name: self.run("podman", "inspect", "--format", "{{.ImageName}}", CONTAINERS[name])
            for name in SERVICES
        }

    def quadlet_refs(self) -> dict[str, str]:
        return {name: inspect(self.quadlets[name], CONTAINERS[name])[1] for name in SERVICES}

    def ledger(self) -> list[str]:
        output = self.run(
            "podman", "exec", "--workdir", "/app/packages/database",
            CONTAINERS["api"], "node", "-e", LEDGER_SCRIPT,
        )
        names = json.loads(output)
        if not isinstance(names, list) or any(not isinstance(name, str) for name in names) or names != sorted(set(names)):
            raise RuntimeError("Applied migration ledger is invalid")
        return names

    def pull_verified(self, ref: str, commit_sha: str) -> None:
        self.run("podman", "pull", ref, timeout=300)
        raw = self.run("podman", "image", "inspect", "--format", "{{json .RepoDigests}}", ref)
        if ref not in json.loads(raw):
            raise RuntimeError("Pulled image digest does not match the release manifest")
        labels = json.loads(self.run("podman", "image", "inspect", "--format", "{{json .Labels}}", ref))
        if not isinstance(labels, dict) or labels.get("org.opencontainers.image.revision") != commit_sha:
            raise RuntimeError("Pulled image source revision does not match the release manifest")

    def verify_service(self, name: str, ref: str, seconds: int = 90) -> None:
        deadline = time.monotonic() + seconds
        path = {"api": "/api/health/ready", "admin": "/admin", "storefront": "/"}.get(name)
        while True:
            try:
                if self.run("systemctl", "--user", "is-active", UNITS[name]) != "active":
                    raise RuntimeError("unit inactive")
                if self.run("podman", "inspect", "--format", "{{.State.Running}}", CONTAINERS[name]) != "true":
                    raise RuntimeError("container stopped")
                if self.run("podman", "inspect", "--format", "{{.ImageName}}", CONTAINERS[name]) != ref:
                    raise RuntimeError("running image differs from release")
                if path:
                    with urllib.request.urlopen(f"http://127.0.0.1:18080{path}", timeout=3) as response:
                        if not 200 <= response.status < 400:
                            raise RuntimeError("HTTP route not ready")
                return
            except (RuntimeError, urllib.error.URLError, TimeoutError):
                if time.monotonic() >= deadline:
                    raise RuntimeError(f"{name} failed readiness within {seconds} seconds") from None
                time.sleep(2)
