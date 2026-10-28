import fcntl
import json
import os
import shutil
import stat
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .host import CONTAINERS, SERVICES, Host, UNITS
from .manifest import validate
from .plan import build_plan
from .quadlet import replace_image


def atomic_text(path: Path, content: str, mode: int = 0o600) -> None:
    if path.is_symlink():
        raise RuntimeError(f"Refusing symlink: {path}")
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with temporary.open("x", encoding="utf-8") as file:
        os.fchmod(file.fileno(), mode)
        file.write(content)
        file.flush()
        os.fsync(file.fileno())
    temporary.replace(path)


def json_record(path: Path, value: dict) -> None:
    atomic_text(path, json.dumps(value, indent=2, sort_keys=True) + "\n")


def read_record(path: Path) -> dict | None:
    if not path.exists():
        return None
    if path.is_symlink():
        raise RuntimeError(f"Refusing symlink: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def state_directory(host: Host) -> Path:
    directory = host.deploy / "releases"
    if directory.is_symlink():
        raise RuntimeError("Release state directory must not be a symlink")
    return directory


@contextmanager
def deployment_lock():
    lock_path = Path(os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.geteuid()}")) / "maevelle-staging-migration.lock"
    with lock_path.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another Maevelle deployment or migration holds the lock") from None
        yield


def verify_running_release(manifest: dict, host: Host) -> dict:
    validate(manifest)
    states = host.service_states()
    for name in CONTAINERS:
        if states.get(name) != "active":
            raise RuntimeError(f"{name} service not started (systemd: {states.get(name) or 'unknown'})")
    # A stopped Quadlet may remove its container. Report the unit state before
    # probing container identity so a partial rollout remains diagnosable.
    host.verify_identity()
    quadlets = host.quadlet_refs()
    running = host.container_refs()
    for name in SERVICES:
        expected = manifest["images"][name]["ref"]
        if quadlets[name] != expected:
            raise RuntimeError(f"{name} Quadlet release digest mismatch")
        if running[name] != expected:
            raise RuntimeError(f"{name} running release digest mismatch")
    applied = host.ledger_ready()
    if applied != manifest["schema"]["migrationNames"]:
        raise RuntimeError("Staging migration ledger does not exactly match target release")
    for name in SERVICES:
        host.verify_service(name, manifest["images"][name]["ref"])
    host.verify_gateway_routes()
    return {"appliedMigrations": len(applied), "verifiedServices": list(SERVICES)}


def apply_release(manifest: dict, host: Host, confirmation: str) -> dict:
    validate(manifest)
    if confirmation != manifest["commitSha"]:
        raise RuntimeError("Apply requires --confirm with the full target commit SHA")
    with deployment_lock():
        return _apply_locked(manifest, host)


def reconcile_release(manifest: dict, host: Host, confirmation: str) -> dict:
    validate(manifest)
    if confirmation != manifest["commitSha"]:
        raise RuntimeError("Verify requires --confirm with the full target commit SHA")
    with deployment_lock():
        directory = state_directory(host)
        current = read_record(directory / "current.json")
        checks = verify_running_release(manifest, host)
        if current and current.get("outcome") == "verified":
            prior = validate(current["manifest"])
            if prior == manifest:
                return {**current, "alreadyVerified": True}
        last = read_record(directory / "latest-attempt.json")
        result = {
            "outcome": "verified",
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
            "verificationMethod": "reconciliation",
            "manifest": manifest,
            "checks": checks,
        }
        if last and last.get("outcome") == "failed" and last.get("targetCommit") == manifest["commitSha"]:
            result["relatedFailedAttemptId"] = last.get("id")
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if current:
            json_record(directory / "previous.json", current)
        json_record(directory / "current.json", result)
        return result


def _apply_locked(manifest: dict, host: Host) -> dict:
    directory = state_directory(host)
    current = read_record(directory / "current.json")
    plan = build_plan(manifest, host, current)
    if plan.pending:
        raise RuntimeError("Pending migrations block application deployment; use the separately reviewed staging-migrate.sh procedure")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    attempt_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    attempt_dir = directory / "attempts" / attempt_id
    attempt_dir.mkdir(mode=0o700, parents=True)
    backup_dir = attempt_dir / "quadlets"
    backup_dir.mkdir(mode=0o700)
    for name in plan.changed:
        shutil.copy2(host.quadlets[name], backup_dir / host.quadlets[name].name)
    attempt = {
        "id": attempt_id,
        "targetCommit": manifest["commitSha"],
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "outcome": "running",
        "rolloutCompleted": False,
        "changed": list(plan.changed),
        "selected": list(plan.selected),
        "backupDirectory": str(backup_dir),
    }
    json_record(directory / "latest-attempt.json", attempt)
    json_record(attempt_dir / "result.json", attempt)
    changed_files = False
    worker_needs_recovery = False
    step = "pull"
    try:
        for name in plan.changed:
            host.pull_verified(plan.new_refs[name], manifest["commitSha"])
        step = "quadlet update"
        for name in plan.changed:
            path = host.quadlets[name]
            original = path.read_text(encoding="utf-8")
            updated = replace_image(original, plan.old_refs[name], plan.new_refs[name])
            atomic_text(path, updated, stat.S_IMODE(path.stat().st_mode))
            changed_files = True
        if changed_files:
            step = "user systemd reload"
            host.run("systemctl", "--user", "daemon-reload")
        if plan.selected:
            step = "service restart/readiness"
            if "worker" in plan.selected:
                worker_needs_recovery = True
                host.run("systemctl", "--user", "stop", UNITS["worker"])
            for name in plan.selected:
                if name == "worker":
                    continue
                host.run("systemctl", "--user", "restart", UNITS[name], timeout=120)
                host.verify_service(name, plan.new_refs[name])
            if "worker" in plan.selected:
                host.run("systemctl", "--user", "start", UNITS["worker"], timeout=120)
                host.verify_service("worker", plan.new_refs["worker"])
        attempt["rolloutCompleted"] = True
        step = "release verification"
        checks = verify_running_release(manifest, host)
        worker_needs_recovery = False
        result = {
            "outcome": "verified", "verifiedAt": datetime.now(timezone.utc).isoformat(),
            "manifest": manifest, "attemptId": attempt_id, "checks": checks,
        }
        if current:
            json_record(directory / "previous.json", current)
        json_record(directory / "current.json", result)
        attempt.update({"outcome": "verified", "finishedAt": result["verifiedAt"]})
        return result
    except Exception as error:
        recovery = "not needed"
        if worker_needs_recovery:
            try:
                # Restart only after the new API and frontends are healthy.
                for name in ("api", "admin", "storefront"):
                    host.verify_service(name, plan.new_refs[name], seconds=5)
                host.run("systemctl", "--user", "start", UNITS["worker"], timeout=120)
                host.verify_service("worker", plan.new_refs["worker"], seconds=30)
                recovery = "worker restarted and verified"
            except Exception as recovery_error:
                recovery = f"worker remains stopped or unhealthy: {recovery_error}"
        attempt.update({
            "outcome": "failed", "failedStep": step,
            "error": str(error),
            "workerRecovery": recovery,
            "recovery": "Inspect this attempt's Quadlet backups and Maevelle user-unit logs. Database migrations were not run. Restore previous compatible application refs only after checking current schema and recorded release.",
            "diagnosticCommands": [f"journalctl --user -u maevelle-{name}.service -n 100 --no-pager" for name in plan.selected],
        })
        # No implicit rollback: the current release may be unrecorded or an operator
        # may have changed the database concurrently outside the shared lock.
        raise
    finally:
        if attempt["outcome"] == "running":
            attempt.update({"outcome": "failed", "failedStep": step, "error": "deployment interrupted"})
        attempt["finishedAt"] = datetime.now(timezone.utc).isoformat()
        json_record(attempt_dir / "result.json", attempt)
        json_record(directory / "latest-attempt.json", attempt)
