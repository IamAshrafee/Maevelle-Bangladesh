"""Rootless pull checker; Phase 03 remains the sole deployment executor."""

import fcntl
import json
import os
import pwd
import uuid
from contextlib import contextmanager
from pathlib import Path

from .execute import apply_release, json_record, read_record, state_directory
from .host import Host
from .manifest import load, validate
from .plan import build_plan
from .registry import DIGEST, Ghcr

HOME = Path("/home/maevelle")
STATE = HOME / "deployment/releases/auto-deploy.json"
INCOMING = HOME / "deployment/releases/incoming"
LOCK = "maevelle-staging-auto-deploy.lock"


def record(path: Path, value: dict) -> None:
    if path.parent.is_symlink():
        raise RuntimeError("Auto-deploy state directory is a symlink")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    json_record(path, value)


@contextmanager
def checker_lock():
    path = Path(os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.geteuid()}")) / LOCK
    with path.open("a+") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another Maevelle auto-deploy check is running") from None
        yield


def download(ref: str, short: str, host: Host = None) -> dict:
    host = host or Host()
    prefix = "ghcr.io/iamashrafee/maevelle-release@"
    if not ref.startswith(prefix) or not DIGEST.fullmatch(ref[len(prefix):]):
        raise RuntimeError("Ready release reference is not digest pinned")
    host.run("podman", "pull", ref, timeout=300)
    digests = json.loads(host.run("podman", "image", "inspect", "--format", "{{json .RepoDigests}}", ref))
    if ref not in digests:
        raise RuntimeError("Ready release image digest mismatch")
    container = host.run("podman", "create", ref, "/release.json")
    if INCOMING.is_symlink() or INCOMING.parent.is_symlink():
        raise RuntimeError("Release input directory is a symlink")
    INCOMING.mkdir(mode=0o700, parents=True, exist_ok=True)
    INCOMING.chmod(0o700)
    temporary = INCOMING / f".auto-{uuid.uuid4().hex}.json"
    try:
        host.run("podman", "cp", f"{container}:/release.json", str(temporary))
        manifest = load(temporary)
        if not manifest["commitSha"].startswith(short):
            raise RuntimeError("Ready tag and manifest commit differ")
        labels = json.loads(host.run("podman", "image", "inspect", "--format", "{{json .Labels}}", ref))
        if labels.get("org.opencontainers.image.revision") != manifest["commitSha"]:
            raise RuntimeError("Release image source revision differs from manifest")
        destination = INCOMING / f"{manifest['commitSha']}.json"
        os.chmod(temporary, 0o600)
        temporary.replace(destination)
        return manifest
    finally:
        host.run("podman", "rm", "-f", container)
        temporary.unlink(missing_ok=True)


def check(*, dry_run=False, host=None, registry=None, fetch=download, state_path=STATE, log=print) -> dict:
    host = host or Host()
    registry = registry or Ghcr()
    if pwd.getpwuid(os.geteuid()).pw_name != "maevelle" or host.home != HOME:
        raise RuntimeError("Auto-deploy must run as rootless maevelle")
    with checker_lock():
        host.verify_identity()
        candidate = registry.latest()
        if candidate is None:
            log("No staging-ready release published")
            return {"outcome": "no-release"}
        sequence, short, ref = candidate
        state = read_record(state_path) or {}
        current = read_record(state_directory(host) / "current.json")
        if current:
            validate(current["manifest"])
        current_sha = current["manifest"]["commitSha"] if current else None
        if state.get("appliedSequence", 0) > sequence:
            log("Ignoring older staging-ready pipeline")
            return {"outcome": "older-release", "runningCommit": current_sha}
        if state.get("appliedSequence") == sequence and state.get("appliedRef") == ref and state.get("appliedCommit") == current_sha and current_sha:
            log("Staging is already on the latest published release")
            return {"outcome": "already-current", "runningCommit": current_sha}
        if state.get("failedRef") == ref and not (current_sha and current_sha.startswith(short)):
            log("Release previously failed; manual review required before retry")
            return {"outcome": "failed-release-held", "runningCommit": current_sha}
        if state.get("inProgressRef") == ref and not (current_sha and current_sha.startswith(short)):
            log("Previous auto-deploy was interrupted; manual review required before retry")
            return {"outcome": "interrupted-release-held", "runningCommit": current_sha}
        try:
            manifest = fetch(ref, short, host)
            if manifest["commitSha"] == current_sha:
                if not dry_run:
                    record(state_path, {**state, "appliedSequence": sequence, "appliedRef": ref, "appliedCommit": current_sha, "failedRef": None, "inProgressRef": None})
                log("Staging is already on the latest published release")
                return {"outcome": "already-current", "runningCommit": current_sha}
            if state.get("failedRef") == ref:
                log("Release previously failed; manual review required before retry")
                return {"outcome": "failed-release-held", "runningCommit": current_sha}
            if state.get("appliedCommit") and current_sha != state["appliedCommit"]:
                log("Running release changed outside auto-deploy; manual review required")
                return {"outcome": "manual-divergence", "runningCommit": current_sha}
            if current and manifest["builtAt"] <= current["manifest"]["builtAt"]:
                log("Ready release predates the running release; refusing downgrade")
                return {"outcome": "older-release", "runningCommit": current_sha}
            plan = build_plan(manifest, host, current)
        except Exception as error:
            if not dry_run:
                record(state_path, {**state, "failedRef": ref, "failure": str(error)[:500]})
            raise
        if plan.pending:
            log(f"Migration gate: {len(plan.pending)} pending; application release unchanged")
            return {"outcome": "migration-blocked", "targetCommit": manifest["commitSha"], "pendingMigrations": list(plan.pending)}
        if dry_run:
            log(f"Preflight ready for {manifest['commitSha']}; services: {', '.join(plan.selected) or 'none'}")
            return {"outcome": "ready", "targetCommit": manifest["commitSha"], "selectedServices": list(plan.selected)}
        # Persist a hold marker before any application unit can be changed. If
        # the process is interrupted, the next timer run will not retry it.
        record(state_path, {**state, "inProgressRef": ref, "targetCommit": manifest["commitSha"]})
        try:
            result = apply_release(manifest, host, manifest["commitSha"])
        except Exception as error:
            record(state_path, {**state, "failedRef": ref, "inProgressRef": None, "failedCommit": manifest["commitSha"], "failure": str(error)[:500]})
            log(f"Auto-deploy failed for {manifest['commitSha']}; held until operator review")
            raise
        record(state_path, {"appliedSequence": sequence, "appliedRef": ref, "appliedCommit": manifest["commitSha"], "failedRef": None})
        log(f"Auto-deploy verified {manifest['commitSha']}; services: {', '.join(plan.selected) or 'none'}")
        return {"outcome": "verified", "targetCommit": manifest["commitSha"], "selectedServices": list(plan.selected), "checks": result["checks"]}
