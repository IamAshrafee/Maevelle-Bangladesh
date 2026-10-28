"""Exact-set artifact inspection and immutable off-host transfer."""

import json
import os
from pathlib import Path

from recovery.capture import interrupt_cleanup, utc_now
from recovery.contract import SET_ID, transition, validate
from recovery.safety import backup_root, load_configuration, recovery_lock
from recovery.storage import MountedStorage, digest


LOCAL_FILES = {"database.dump.age", "media.tar.age", "quiescence.json", "manifest.json"}


def read_set(set_id: str) -> tuple[Path, dict]:
    if not SET_ID.fullmatch(set_id):
        raise ValueError("Invalid Maevelle recovery-set ID")
    directory = backup_root() / set_id
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("Maevelle recovery set is missing or unsafe")
    path = directory / "manifest.json"
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise ValueError("Maevelle recovery manifest is missing or unsafe")
    manifest = validate(json.loads(path.read_text(encoding="utf-8")))
    if manifest["recoverySetId"] != set_id:
        raise ValueError("Recovery manifest does not match directory")
    expected = {"manifest.json", "database.dump.age"}
    if manifest["kind"] == "coordinated":
        expected |= {"media.tar.age", "quiescence.json"}
    optional = {"pin.json"} if (directory / "pin.json").exists() or (directory / "pin.json").is_symlink() else set()
    if {item.name for item in directory.iterdir()} != expected | optional:
        raise ValueError("Recovery set has unexpected or missing files")
    if any(item.is_symlink() or not item.is_file() for item in directory.iterdir()):
        raise ValueError("Recovery set contains an unsafe artifact")
    return directory, manifest


def inspect_set(set_id: str) -> dict:
    directory, manifest = read_set(set_id)
    for artifact in manifest["artifacts"].values():
        if artifact is None:
            continue
        path = directory / artifact["name"]
        if path.stat().st_size != artifact["sizeBytes"] or digest(path) != artifact["sha256"]:
            raise ValueError("Recovery artifact size or checksum mismatch")
    evidence = manifest["consistency"]["evidenceSha256"]
    if evidence and digest(directory / "quiescence.json") != evidence:
        raise ValueError("Quiescence evidence checksum mismatch")
    return {"recoverySetId": set_id, "kind": manifest["kind"], "state": manifest["state"],
            "localIntegrity": True, "restoreVerified": manifest["state"] == "restore-verified"}


def _replace_manifest(path: Path, manifest: dict) -> None:
    temporary = path.with_name(".manifest-next")
    if temporary.exists() or temporary.is_symlink():
        raise ValueError("Incomplete manifest update requires operator review")
    try:
        with temporary.open("xb") as output:
            os.fchmod(output.fileno(), 0o600)
            output.write((json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode())
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


def transfer_verify(set_id: str, confirmation: str, inventory_provider, storage_factory=MountedStorage) -> dict:
    if confirmation != set_id:
        raise ValueError("Transfer requires exact recovery-set ID confirmation")
    with interrupt_cleanup(), recovery_lock():
        snapshot = inventory_provider()
        config = load_configuration(snapshot)
        directory, manifest = read_set(set_id)
        if manifest["environment"]["hostId"] != config["hostId"] or manifest["release"]["commitSha"] != config["releaseCommit"]:
            raise ValueError("Recovery set differs from approved host or release")
        if manifest["state"] not in ("captured", "transferred", "integrity-verified"):
            raise ValueError("Recovery set cannot be transferred from this state")
        inspect_set(set_id)
        storage = storage_factory(Path(config["storage"]["root"]))
        names = ["database.dump.age"]
        if manifest["kind"] == "coordinated":
            names += ["media.tar.age", "quiescence.json"]
        files = {name: directory / name for name in names}
        if manifest["state"] == "captured":
            files["capture-manifest.json"] = directory / "manifest.json"
        object_key = storage.put_immutable(set_id, files)
        for name, source in files.items():
            if storage.readback_sha256(set_id, name) != digest(source):
                raise ValueError("Off-host readback checksum mismatch")
        if manifest["state"] == "captured":
            manifest = transition(manifest, "transferred", utc_now(),
                                  {"offHost": {"provider": storage.provider, "objectKey": object_key}})
            _replace_manifest(directory / "manifest.json", manifest)
        if manifest["state"] == "transferred":
            at = utc_now()
            verified = transition(manifest, "integrity-verified", at,
                                  {"verification": {"integrity": {"verifiedAt": at,
                                                                      "artifactSha256Matched": True,
                                                                      "offHostReadback": True}, "restore": None}})
            _replace_manifest(directory / "manifest.json", verified)
        storage.put_immutable(set_id, {"verified-manifest.json": directory / "manifest.json"})
        if storage.readback_sha256(set_id, "verified-manifest.json") != digest(directory / "manifest.json"):
            raise ValueError("Off-host verified manifest readback mismatch")
        return {"recoverySetId": set_id, "state": "integrity-verified", "offHostReadback": True,
                "restoreVerified": False}
