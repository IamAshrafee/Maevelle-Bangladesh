"""Conservative, reviewable Maevelle recovery-set retention."""

import hashlib
import json
from datetime import datetime
from pathlib import Path

from recovery.contract import SET_ID
from recovery.operations import inspect_set, read_set
from recovery.safety import backup_root, load_configuration, recovery_lock
from recovery.storage import MountedStorage, digest


def _day(value: dict) -> str:
    return value["capture"]["startedAt"][:10]


def _week(value: dict) -> str:
    return datetime.fromisoformat(value["capture"]["startedAt"].replace("Z", "+00:00")).strftime("%G-W%V")


def retention_plan(config: dict) -> dict:
    root = backup_root()
    entries = []
    for path in root.iterdir():
        if not SET_ID.fullmatch(path.name):
            continue
        if path.is_symlink():
            raise ValueError("Symlinked Maevelle recovery set")
        directory, manifest = read_set(path.name)
        entries.append((directory, manifest))
    entries.sort(key=lambda pair: pair[1]["capture"]["startedAt"], reverse=True)
    policy = config["retention"]
    keep = set()
    daily = weekly = 0
    days, weeks = set(), set()
    verified = [m for _, m in entries if m["kind"] == "coordinated" and m["state"] == "restore-verified"]
    distinct_reports = {m["verification"]["restore"]["reportId"] for m in verified}
    # Any ambiguity in independent restore evidence freezes pruning.
    can_prune = policy["approved"] is True and len(distinct_reports) >= 2
    for _, manifest in entries:
        set_id = manifest["recoverySetId"]
        day, week = _day(manifest), _week(manifest)
        if day not in days and daily < policy["daily"]:
            keep.add(set_id)
            days.add(day)
            daily += 1
        if week not in weeks and weekly < policy["weekly"]:
            keep.add(set_id)
            weeks.add(week)
            weekly += 1
    protected_reports = set()
    for manifest in verified:
        report_id = manifest["verification"]["restore"]["reportId"]
        if report_id not in protected_reports:
            keep.add(manifest["recoverySetId"])
            protected_reports.add(report_id)
        if len(protected_reports) == 2:
            break
    decisions = []
    for directory, manifest in entries:
        set_id = manifest["recoverySetId"]
        pin = directory / "pin.json"
        if pin.exists() or pin.is_symlink():
            if pin.is_symlink() or not pin.is_file() or pin.stat().st_size > 4096:
                raise ValueError("Unsafe recovery retention pin")
            record = json.loads(pin.read_text(encoding="utf-8"))
            if not isinstance(record, dict) or set(record) != {"recoverySetId", "reason"} or record["recoverySetId"] != set_id or record["reason"] not in ("pre-migration", "pre-reset", "operator"):
                raise ValueError("Invalid recovery retention pin")
            reason = "pinned"
        elif manifest["state"] != "restore-verified":
            reason = "incomplete-or-unverified"
        elif manifest["kind"] != "coordinated":
            reason = "database-only"
        elif set_id in keep:
            reason = "policy-or-minimum"
        elif not can_prune:
            reason = "fewer-than-two-independent-restores-or-policy-unapproved"
        else:
            reason = "eligible"
        decisions.append({"recoverySetId": set_id, "decision": "delete" if reason == "eligible" else "keep",
                          "reason": reason, "manifestSha256": digest(directory / "manifest.json")})
    plan = {"hostId": config["hostId"], "policy": policy, "decisions": decisions}
    plan["planId"] = hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return plan


def execute_retention(confirmation: str, inventory_provider, storage_factory=MountedStorage) -> dict:
    with recovery_lock():
        config = load_configuration(inventory_provider())
        plan = retention_plan(config)
        if confirmation != plan["planId"] or config["retention"]["approved"] is not True:
            raise ValueError("Retention requires exact approved current plan ID")
        targets = [item for item in plan["decisions"] if item["decision"] == "delete"]
        if not targets:
            return {"deleted": [], "planId": plan["planId"]}
        storage = storage_factory(Path(config["storage"]["root"]))
        deleted = []
        for target in targets:
            set_id = target["recoverySetId"]
            directory, manifest = read_set(set_id)
            if digest(directory / "manifest.json") != target["manifestSha256"] or manifest["state"] != "restore-verified":
                raise ValueError("Retention target changed after planning")
            inspect_set(set_id)
            local_names = {entry.name for entry in directory.iterdir()}
            expected_local = {"manifest.json", "database.dump.age", "media.tar.age"}
            expected_remote = {"capture-manifest.json", "verified-manifest.json", "database.dump.age", "media.tar.age"}
            if manifest["kind"] == "coordinated":
                expected_local.add("quiescence.json")
                expected_remote.add("quiescence.json")
            if local_names != expected_local:
                raise ValueError("Retention target contents changed")
            for name in expected_remote:
                remote_hash = storage.readback_sha256(set_id, name)
                if name in expected_local and remote_hash != digest(directory / name):
                    raise ValueError("Retention off-host artifact mismatch")
            storage.delete_exact(set_id, expected_remote)
            for name in sorted(expected_local):
                (directory / name).unlink()
            directory.rmdir()
            deleted.append(set_id)
        return {"deleted": deleted, "planId": plan["planId"]}
