"""Versioned portable recovery-set manifest validation; no filesystem effects."""

import hashlib
import copy
import re
from datetime import datetime, timezone

from staging.manifest import SERVICES, validate as validate_release

FORMAT_VERSION = 1
STATES = ("candidate", "captured", "transferred", "integrity-verified", "restore-verified", "failed")
NEXT = {
    "candidate": {"captured", "failed"},
    "captured": {"transferred", "failed"},
    "transferred": {"integrity-verified", "failed"},
    "integrity-verified": {"restore-verified", "failed"},
    "restore-verified": set(),
    "failed": set(),
}
HEX64 = re.compile(r"^[a-f0-9]{64}$")
SET_ID = re.compile(r"^mvl-stg-\d{8}T\d{6}Z-[a-f0-9]{16}$")
SAFE_TOKEN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")
ARTIFACT_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.(?:dump|tar|age)$")
STORAGE_KEY = re.compile(r"^maevelle/staging/[a-zA-Z0-9._/-]{1,180}$")
REQUIRED = {
    "formatVersion", "recoverySetId", "kind", "state", "stateHistory", "environment",
    "capture", "database", "artifacts", "release", "migrations", "mediaExpected",
    "consistency", "encryption", "offHost", "verification", "recoveryPoint",
}


def _object(value, keys, label):
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"Invalid {label} fields")
    return value


def _utc(value, label):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z", value):
        raise ValueError(f"Invalid {label} UTC timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"Invalid {label} UTC timestamp") from None
    if parsed.tzinfo != timezone.utc:
        raise ValueError(f"Invalid {label} UTC timestamp")
    return parsed


def _nonnegative(value, label):
    if type(value) is not int or value < 0:
        raise ValueError(f"Invalid {label}")


def _token(value, label):
    if not isinstance(value, str) or not SAFE_TOKEN.fullmatch(value) or value in (".", ".."):
        raise ValueError(f"Invalid {label}")


def _artifact(value, label):
    _object(value, {"name", "sizeBytes", "sha256"}, label)
    if not isinstance(value["name"], str) or not ARTIFACT_NAME.fullmatch(value["name"]) or ".." in value["name"]:
        raise ValueError(f"Invalid {label} artifact name")
    _nonnegative(value["sizeBytes"], f"{label} size")
    if value["sizeBytes"] == 0 or not isinstance(value["sha256"], str) or not HEX64.fullmatch(value["sha256"]):
        raise ValueError(f"Invalid {label} size or checksum")


def ledger_hash(names):
    return hashlib.sha256("\n".join(names).encode("utf-8")).hexdigest()


def transition(manifest, new_state, at, updates=None):
    """Return a new validated manifest; never mutate the input or publish files."""
    validate(manifest)
    if new_state not in NEXT[manifest["state"]]:
        raise ValueError("Illegal recovery state transition")
    _utc(at, "transition")
    allowed_updates = {
        "captured": {"capture", "artifacts", "mediaExpected", "consistency", "recoveryPoint"},
        "transferred": {"offHost"},
        "integrity-verified": {"verification"},
        "restore-verified": {"verification"},
        "failed": set(),
    }
    updates = updates or {}
    if not isinstance(updates, dict) or not set(updates) <= allowed_updates[new_state]:
        raise ValueError("Illegal recovery transition fields")
    updated = copy.deepcopy(manifest)
    updated.update(copy.deepcopy(updates))
    updated["state"] = new_state
    updated["stateHistory"].append({"state": new_state, "at": at})
    return validate(updated)


def coordinated_eligible(manifest):
    validate(manifest)
    return manifest["kind"] == "coordinated" and manifest["state"] == "restore-verified"


def _validate(manifest):
    _object(manifest, REQUIRED, "manifest")
    if type(manifest["formatVersion"]) is not int or manifest["formatVersion"] != FORMAT_VERSION:
        raise ValueError("Unsupported recovery manifest version")
    if not isinstance(manifest["recoverySetId"], str) or not SET_ID.fullmatch(manifest["recoverySetId"]):
        raise ValueError("Invalid recovery-set ID")
    if manifest["kind"] not in ("database-only", "coordinated") or manifest["state"] not in STATES:
        raise ValueError("Invalid recovery kind or state")
    history = manifest["stateHistory"]
    if not isinstance(history, list) or not history or len(history) > len(STATES) or not isinstance(history[0], dict) or history[0].get("state") != "candidate":
        raise ValueError("Invalid recovery state history")
    previous_at = None
    for index, event in enumerate(history):
        _object(event, {"state", "at"}, "state event")
        at = _utc(event["at"], "state event")
        if index and (event["state"] not in NEXT[history[index - 1]["state"]] or at < previous_at):
            raise ValueError("Illegal recovery state history")
        previous_at = at
    if history[-1]["state"] != manifest["state"]:
        raise ValueError("Recovery state/history mismatch")
    environment = _object(manifest["environment"], {"name", "hostId", "linuxUser", "uid", "network", "postgresContainer", "postgresVolume", "mediaVolume"}, "environment")
    host_id = environment["hostId"]
    expected_environment = {"name": "staging", "linuxUser": "maevelle", "uid": 1001, "network": "maevelle-staging", "postgresContainer": "maevelle-staging-postgres", "postgresVolume": "maevelle-staging-postgres", "mediaVolume": "maevelle-staging-media"}
    if not isinstance(host_id, str) or not re.fullmatch(r"[a-f0-9]{32}", host_id) or {key: value for key, value in environment.items() if key != "hostId"} != expected_environment:
        raise ValueError("Recovery environment identity differs from Maevelle staging")
    capture = _object(manifest["capture"], {"startedAt", "completedAt"}, "capture")
    start = _utc(capture["startedAt"], "capture start")
    end = _utc(capture["completedAt"], "capture end") if capture["completedAt"] is not None else None
    if end and end < start:
        raise ValueError("Capture end precedes start")
    if history[0]["at"] != capture["startedAt"] or (end and previous_at < end):
        raise ValueError("Capture and state history times are inconsistent")
    captured_event = next((event for event in history if event["state"] == "captured"), None)
    if captured_event and (end is None or _utc(captured_event["at"], "captured state") < end):
        raise ValueError("Captured state precedes completed capture")
    database = _object(manifest["database"], {"name", "serverVersion", "clientVersion"}, "database")
    if database["name"] != "maevelle_staging":
        raise ValueError("Recovery database is not Maevelle staging")
    for key in ("serverVersion", "clientVersion"):
        if not isinstance(database[key], str) or not re.fullmatch(r"18(?:\.\d+)?", database[key]):
            raise ValueError("Recovery requires PostgreSQL 18 version identity")
    release = _object(manifest["release"], {"commitSha", "images"}, "release")
    if not isinstance(release["commitSha"], str) or not re.fullmatch(r"[a-f0-9]{40}", release["commitSha"]):
        raise ValueError("Invalid release SHA")
    images = release["images"]
    if not isinstance(images, dict) or set(images) != set(SERVICES):
        raise ValueError("Four application images are required")
    for service in SERVICES:
        if not isinstance(images[service], str) or not re.fullmatch(rf"ghcr\.io/iamashrafee/maevelle-{service}@sha256:[a-f0-9]{{64}}", images[service]):
            raise ValueError("Invalid immutable application image")
    migrations = _object(manifest["migrations"], {"names", "sha256"}, "migrations")
    names = migrations["names"]
    if not isinstance(names, list) or len(names) < 51 or names != sorted(set(names)) or any(not isinstance(name, str) or not re.fullmatch(r"\d{4}_[a-z0-9_]+", name) for name in names):
        raise ValueError("Invalid migration ledger")
    if migrations["sha256"] != ledger_hash(names):
        raise ValueError("Migration ledger hash mismatch")
    # Reuse Phase 03's reviewed baseline and image validation without requiring a local Git checkout.
    validate_release({"formatVersion": 1, "status": "published", "commitSha": release["commitSha"], "shortSha": release["commitSha"][:12], "builtAt": capture["startedAt"], "images": {name: {"repository": f"ghcr.io/iamashrafee/maevelle-{name}", "digest": images[name].split("@", 1)[1], "ref": images[name]} for name in SERVICES}, "schema": {"baselineRelease": "ccd405c1e6fa8c827307977b947a4a3dbce859f5", "migrationNames": names}})
    expected = _object(manifest["mediaExpected"], {"objectCount", "totalBytes"}, "media expectation")
    for key in expected:
        _nonnegative(expected[key], key)
    artifacts = _object(manifest["artifacts"], {"database", "media"}, "artifacts")
    consistency = _object(manifest["consistency"], {"mode", "writersStopped", "startedAt", "endedAt", "ledgerBeforeSha256", "ledgerAfterSha256", "evidenceSha256"}, "consistency")
    if consistency["mode"] != ("quiesced" if manifest["kind"] == "coordinated" else "online"):
        raise ValueError("Recovery consistency mode does not match kind")
    reached = {event["state"] for event in history}
    if type(consistency["writersStopped"]) is not bool or ("captured" in reached and consistency["writersStopped"] != (manifest["kind"] == "coordinated")) or (manifest["kind"] == "database-only" and consistency["writersStopped"]):
        raise ValueError("Recovery writer quiescence evidence is invalid")
    for key in ("startedAt", "endedAt"):
        if consistency[key] is not None:
            _utc(consistency[key], f"consistency {key}")
    for key in ("ledgerBeforeSha256", "ledgerAfterSha256", "evidenceSha256"):
        if consistency[key] is not None and (not isinstance(consistency[key], str) or not HEX64.fullmatch(consistency[key])):
            raise ValueError("Invalid consistency ledger hash")
    encryption = _object(manifest["encryption"], {"method", "keyId"}, "encryption")
    if encryption["method"] != "age" or not isinstance(encryption["keyId"], str) or not SAFE_TOKEN.fullmatch(encryption["keyId"]):
        raise ValueError("Invalid encryption metadata")
    offhost = manifest["offHost"]
    if offhost is not None:
        _object(offhost, {"provider", "objectKey"}, "off-host reference")
        _token(offhost["provider"], "off-host provider")
        if not isinstance(offhost["objectKey"], str) or not STORAGE_KEY.fullmatch(offhost["objectKey"]) or ".." in offhost["objectKey"] or "//" in offhost["objectKey"]:
            raise ValueError("Unsafe off-host object key")
        if not offhost["objectKey"].startswith(f"maevelle/staging/{manifest['recoverySetId']}/"):
            raise ValueError("Off-host reference is not bound to recovery-set ID")
    verification = _object(manifest["verification"], {"integrity", "restore"}, "verification")
    for name, keys in (("integrity", {"verifiedAt", "artifactSha256Matched", "offHostReadback"}), ("restore", {"verifiedAt", "isolated", "databaseName", "mediaChecked", "reportId", "reportSha256", "recoverySetId", "migrationSha256"})):
        value = verification[name]
        if value is not None:
            _object(value, keys, f"{name} verification")
            _utc(value["verifiedAt"], f"{name} verifiedAt")
    point = _object(manifest["recoveryPoint"], {"databaseAt", "mediaAt", "limitations"}, "recovery point")
    if point["databaseAt"] is not None:
        _utc(point["databaseAt"], "database recovery point")
    if point["mediaAt"] is not None:
        _utc(point["mediaAt"], "media recovery point")
    if not isinstance(point["limitations"], list) or len(point["limitations"]) != len(set(point["limitations"])) or any(item not in ("no-point-in-time-recovery", "database-only-no-media", "external-effects-not-reversed") for item in point["limitations"]):
        raise ValueError("Invalid recovery limitations")
    if "no-point-in-time-recovery" not in point["limitations"] or "external-effects-not-reversed" not in point["limitations"]:
        raise ValueError("Required recovery limitations missing")
    if manifest["kind"] == "database-only":
        if artifacts["media"] is not None or point["mediaAt"] is not None or "database-only-no-media" not in point["limitations"] or expected != {"objectCount": 0, "totalBytes": 0}:
            raise ValueError("Database-only checkpoint cannot claim media")
    elif "database-only-no-media" in point["limitations"]:
        raise ValueError("Coordinated set cannot carry database-only limitation")
    captured = "captured" in reached
    if captured:
        if end is None or artifacts["database"] is None or point["databaseAt"] is None:
            raise ValueError("Captured recovery set lacks database artifact or recovery point")
        _artifact(artifacts["database"], "database")
        if not artifacts["database"]["name"].endswith(".age"):
            raise ValueError("Database artifact must be encrypted")
        if manifest["kind"] == "coordinated":
            _artifact(artifacts["media"], "media")
            if not artifacts["media"]["name"].endswith(".age"):
                raise ValueError("Media artifact must be encrypted")
            if point["mediaAt"] is None or consistency["startedAt"] is None or consistency["endedAt"] is None or consistency["evidenceSha256"] is None:
                raise ValueError("Coordinated capture lacks media or quiescence evidence")
            if _utc(consistency["startedAt"], "quiescence start") > start or _utc(consistency["endedAt"], "quiescence end") < end:
                raise ValueError("Capture exceeded writer quiescence interval")
        if consistency["ledgerBeforeSha256"] != migrations["sha256"] or consistency["ledgerAfterSha256"] != migrations["sha256"]:
            raise ValueError("Ledger changed during capture")
    elif (end is not None or artifacts["database"] is not None or artifacts["media"] is not None):
        raise ValueError("Candidate has published artifacts")
    if "transferred" in reached and offhost is None:
        raise ValueError("Transferred set lacks off-host reference")
    if "integrity-verified" in reached:
        integrity = verification["integrity"]
        if integrity is None or integrity["artifactSha256Matched"] is not True or integrity["offHostReadback"] is not True:
            raise ValueError("Off-host integrity proof is missing")
    if manifest["state"] == "restore-verified":
        restore = verification["restore"]
        if restore is None or restore["isolated"] is not True or restore["databaseName"] == "maevelle_staging" or not isinstance(restore["databaseName"], str) or not re.fullmatch(r"maevelle_restore_[a-z0-9_]+", restore["databaseName"]) or restore["mediaChecked"] is not (manifest["kind"] == "coordinated"):
            raise ValueError("Independent isolated restore proof is missing")
        if restore["recoverySetId"] != manifest["recoverySetId"] or restore["migrationSha256"] != migrations["sha256"] or not isinstance(restore["reportSha256"], str) or not HEX64.fullmatch(restore["reportSha256"]):
            raise ValueError("Restore evidence does not bind to this recovery set")
        if _utc(restore["verifiedAt"], "restore verifiedAt") < _utc(verification["integrity"]["verifiedAt"], "integrity verifiedAt"):
            raise ValueError("Restore verification predates integrity verification")
        _token(restore["reportId"], "restore report ID")
    return manifest


def validate(manifest):
    try:
        return _validate(manifest)
    except (KeyError, TypeError, AttributeError):
        raise ValueError("Malformed recovery manifest") from None
