import json
import os
import pwd
import re
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
  if (!process.env.DATABASE_URL) {
    console.error('MAEVELLE_LEDGER_ERROR:CONFIGURATION_ERROR');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3000, query_timeout: 3000 });
  try {
    const rows = await pool.query('select name from public.kysely_migration order by name');
    process.stdout.write(JSON.stringify(rows.rows.map(row => row.name)));
  } finally { await pool.end(); }
})().catch((error) => {
  const code = error?.code;
  const kind = code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'DNS_UNAVAILABLE'
    : ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', '08001', '08006', '57P01', '57P03', '53300'].includes(code)
      || error?.message === 'Connection terminated unexpectedly'
      || error?.message?.startsWith('Query read timeout') ? 'DATABASE_UNAVAILABLE'
    : code === '42P01' ? 'LEDGER_MISSING' : 'QUERY_FAILED';
  console.error(`MAEVELLE_LEDGER_ERROR:${kind}`);
  process.exit(1);
});
"""

LEDGER_KINDS = {
    "DNS_UNAVAILABLE": ("migration ledger DNS unavailable", True),
    "DATABASE_UNAVAILABLE": ("migration ledger database connection unavailable", True),
    "CONFIGURATION_ERROR": ("migration ledger database configuration missing", False),
    "LEDGER_MISSING": ("migration ledger table missing", False),
    "QUERY_FAILED": ("migration ledger query failed", False),
}


class LedgerError(RuntimeError):
    def __init__(self, message: str, transient: bool):
        super().__init__(message)
        self.transient = transient


class ReadinessError(RuntimeError):
    pass


class Host:
    def __init__(self, home: Path = HOME):
        self.home = home
        self.quadlets = {name: home / ".config/containers/systemd" / f"maevelle-{name}.container" for name in CONTAINERS}
        self.deploy = home / "deployment"

    def run(self, *args: str, timeout: int = 30) -> str:
        try:
            result = subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)
        except subprocess.TimeoutExpired:
            if args[:2] == ("podman", "exec"):
                raise LedgerError("migration ledger container exec timed out", True) from None
            raise RuntimeError(f"{' '.join(args[:2])} timed out") from None
        if result.returncode:
            if args[:2] == ("podman", "exec"):
                marker = re.search(r"MAEVELLE_LEDGER_ERROR:([A-Z_]+)", result.stderr)
                if marker and marker.group(1) in LEDGER_KINDS:
                    message, transient = LEDGER_KINDS[marker.group(1)]
                    raise LedgerError(message, transient)
                if "MODULE_NOT_FOUND" in result.stderr:
                    raise LedgerError("migration ledger runtime module unavailable", False)
                raise LedgerError(f"migration ledger container exec failed (exit {result.returncode})", True)
            # Do not echo unrestricted stderr from commands that may handle secrets.
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
            timeout=10,
        )
        names = json.loads(output)
        if not isinstance(names, list) or any(not isinstance(name, str) for name in names) or names != sorted(set(names)):
            raise RuntimeError("Applied migration ledger is invalid")
        return names

    def ledger_ready(self, seconds: int = 90) -> list[str]:
        deadline = time.monotonic() + seconds
        while True:
            try:
                return self.ledger()
            except LedgerError as error:
                if not error.transient or time.monotonic() >= deadline:
                    raise RuntimeError(f"Migration ledger verification failed: {error}") from None
                time.sleep(min(2, max(0, deadline - time.monotonic())))

    def pull_verified(self, ref: str, commit_sha: str) -> None:
        self.run("podman", "pull", ref, timeout=300)
        raw = self.run("podman", "image", "inspect", "--format", "{{json .RepoDigests}}", ref)
        if ref not in json.loads(raw):
            raise RuntimeError("Pulled image digest does not match the release manifest")
        labels = json.loads(self.run("podman", "image", "inspect", "--format", "{{json .Labels}}", ref))
        if not isinstance(labels, dict) or labels.get("org.opencontainers.image.revision") != commit_sha:
            raise RuntimeError("Pulled image source revision does not match the release manifest")

    def check_http(self, path: str, label: str, allow_redirect: bool = False) -> None:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:18080{path}", timeout=3) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
        except (urllib.error.URLError, TimeoutError):
            raise ReadinessError(f"{label}: gateway HTTP connection unavailable") from None
        if status == 200 or (allow_redirect and 300 <= status < 400):
            return
        if path == "/api/health/ready" and status == 503:
            raise ReadinessError("API database readiness failure (HTTP 503)")
        if path == "/api/health/live" and status in (502, 503, 504):
            raise ReadinessError(f"API not listening yet or gateway upstream unavailable (HTTP {status})")
        raise ReadinessError(f"{label}: HTTP health check failed (HTTP {status})")

    def wait_ready(self, check, seconds: int) -> None:
        deadline = time.monotonic() + seconds
        while True:
            try:
                check()
                return
            except ReadinessError as error:
                if time.monotonic() >= deadline:
                    raise RuntimeError(f"Readiness failed after {seconds} seconds: {error}") from None
                time.sleep(min(2, max(0, deadline - time.monotonic())))

    def verify_service(self, name: str, ref: str, seconds: int = 90) -> None:
        def check() -> None:
            state = self.service_states().get(name)
            if state != "active":
                raise ReadinessError(f"{name} service not started (systemd: {state or 'unknown'})")
            try:
                running = self.run("podman", "inspect", "--format", "{{.State.Running}}", CONTAINERS[name])
            except RuntimeError:
                raise ReadinessError(f"{name} container state unavailable") from None
            if running != "true":
                raise ReadinessError(f"{name} container not running")
            try:
                image = self.run("podman", "inspect", "--format", "{{.ImageName}}", CONTAINERS[name])
            except RuntimeError:
                raise ReadinessError(f"{name} running image unavailable") from None
            if image != ref:
                raise RuntimeError(f"{name} release digest mismatch")
            if name == "api":
                self.check_http("/api/health/live", "API liveness")
                self.check_http("/api/health/ready", "API readiness")
            elif name == "admin":
                self.check_http("/admin", "Admin route", allow_redirect=True)
            elif name == "storefront":
                self.check_http("/", "Storefront route", allow_redirect=True)

        self.wait_ready(check, seconds)

    def verify_gateway_routes(self, seconds: int = 60) -> None:
        for path, label in (
            ("/api/auth/get-session", "Better Auth session route"),
            ("/api/storefront/v1/context", "Storefront context route"),
        ):
            self.wait_ready(lambda path=path, label=label: self.check_http(path, label), seconds)
