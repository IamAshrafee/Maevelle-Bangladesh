"""Shared Maevelle-only mutation preflight and serialization boundary."""

import fcntl
import json
import os
import re
import stat
from contextlib import contextmanager
from pathlib import Path

from recovery.inventory import HOME, safe_path

BACKUP_ROOT = HOME / "deployment/backups"
CONFIG_PATH = HOME / "deployment/secrets/recovery.json"
RECIPIENTS_PATH = HOME / "deployment/secrets/backup-recipients.txt"
LOCK_PATH = Path("/run/user/1001/maevelle-staging-migration.lock")
EXPECTED_UID = 1001


def _private_file(path: Path, uid: int) -> None:
    safe_path(path, HOME)
    info = path.stat(follow_symlinks=False)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError("Recovery configuration identity or permissions invalid")


def load_configuration(inventory: dict) -> dict:
    """Read approved operator configuration without returning secret values to the CLI."""
    identity = inventory.get("identity", {})
    if identity.get("uid") != EXPECTED_UID or identity.get("linuxUser") != "maevelle" or identity.get("rootless") is not True:
        raise ValueError("Recovery requires rootless Maevelle UID 1001")
    if identity.get("sentinelPresent") is not True:
        raise ValueError("Explicit STAGING_ENVIRONMENT=staging sentinel is required")
    _private_file(CONFIG_PATH, EXPECTED_UID)
    _private_file(RECIPIENTS_PATH, EXPECTED_UID)
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(config, dict) or set(config) != {"formatVersion", "enabled", "hostId", "releaseCommit", "keyId", "storage", "retention"}:
        raise ValueError("Recovery configuration fields invalid")
    if config["formatVersion"] != 1 or config["enabled"] is not True:
        raise ValueError("Recovery execution is not operator-enabled")
    if config["hostId"] != identity.get("hostId") or config["releaseCommit"] != inventory.get("releaseRecord", {}).get("commitSha"):
        raise ValueError("Recovery host or deployed release differs from approval")
    if not isinstance(config["keyId"], str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}", config["keyId"]):
        raise ValueError("Recovery key ID invalid")
    recipients = [line.strip() for line in RECIPIENTS_PATH.read_text(encoding="ascii").splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if not recipients or any(not re.fullmatch(r"age1[a-z0-9]{20,2000}", line) for line in recipients):
        raise ValueError("Recovery recipient file is missing a supported public key")
    storage = config["storage"]
    if not isinstance(storage, dict) or set(storage) != {"provider", "root", "approved"} or storage["provider"] != "mounted-filesystem" or storage["approved"] is not True:
        raise ValueError("Off-host storage is not approved")
    root = storage["root"]
    if root != "/mnt/maevelle-staging-backups" or Path(root).is_symlink():
        raise ValueError("Off-host storage root is unsafe")
    policy = config["retention"]
    if not isinstance(policy, dict) or set(policy) != {"daily", "weekly", "approved"} or type(policy["daily"]) is not int or type(policy["weekly"]) is not int or not (2 <= policy["daily"] <= 90 and 0 <= policy["weekly"] <= 52):
        raise ValueError("Recovery retention policy invalid")
    return config


def backup_root(create: bool = False) -> Path:
    safe_path(BACKUP_ROOT, HOME, allow_missing=True)
    if not BACKUP_ROOT.exists():
        if not create:
            raise ValueError("Maevelle backup directory is absent")
        BACKUP_ROOT.mkdir(mode=0o700)
    info = BACKUP_ROOT.stat(follow_symlinks=False)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError("Maevelle backup directory identity or permissions invalid")
    return BACKUP_ROOT


@contextmanager
def recovery_lock():
    runtime = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{EXPECTED_UID}")
    if runtime != str(LOCK_PATH.parent):
        raise ValueError("Recovery runtime directory differs from shared Maevelle lock")
    parent = LOCK_PATH.parent
    if parent.is_symlink() or not parent.is_dir() or parent.stat().st_uid != EXPECTED_UID:
        raise ValueError("Maevelle runtime directory identity invalid")
    descriptor = os.open(LOCK_PATH, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != EXPECTED_UID or stat.S_IMODE(info.st_mode) & 0o077:
            raise ValueError("Maevelle shared lock identity invalid")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("Another Maevelle migration, deployment or recovery operation holds the lock") from None
        yield
    finally:
        os.close(descriptor)
