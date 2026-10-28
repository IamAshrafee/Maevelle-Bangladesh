import copy
import unittest

from recovery.contract import coordinated_eligible, ledger_hash, transition, validate
from staging.manifest import SERVICES

def fixture(kind="coordinated", state="restore-verified"):
    # Use the real reviewed baseline names rather than invented migration names.
    import json
    from pathlib import Path
    names = sorted(json.loads((Path(__file__).resolve().parents[2] / "packages/database/migration-history-baseline.json").read_text())["migrations"])
    states = ["candidate", "captured", "transferred", "integrity-verified", "restore-verified"]
    if state == "failed":
        states = ["candidate", "failed"]
    else:
        states = states[: states.index(state) + 1]
    captured = "captured" in states
    transferred = "transferred" in states
    integrity = "integrity-verified" in states
    restored = "restore-verified" in states
    digest = "a" * 64
    return {
        "formatVersion": 1, "recoverySetId": "mvl-stg-20261027T120000Z-0123456789abcdef",
        "kind": kind, "state": state,
        "stateHistory": [{"state": s, "at": f"2026-10-27T12:00:0{i}Z"} for i, s in enumerate(states)],
        "environment": {"name": "staging", "hostId": "b" * 32, "linuxUser": "maevelle", "uid": 1001, "network": "maevelle-staging", "postgresContainer": "maevelle-staging-postgres", "postgresVolume": "maevelle-staging-postgres", "mediaVolume": "maevelle-staging-media"},
        "capture": {"startedAt": "2026-10-27T12:00:00Z", "completedAt": "2026-10-27T12:00:01Z" if captured else None},
        "database": {"name": "maevelle_staging", "serverVersion": "18.6", "clientVersion": "18.6"},
        "artifacts": {"database": {"name": "database.dump.age", "sizeBytes": 100, "sha256": digest} if captured else None, "media": {"name": "media.tar.age", "sizeBytes": 200, "sha256": digest} if captured and kind == "coordinated" else None},
        "release": {"commitSha": "87fec723c9fcfa30424f82c7520c984bded477f3", "images": {s: f"ghcr.io/iamashrafee/maevelle-{s}@sha256:{digest}" for s in SERVICES}},
        "migrations": {"names": names, "sha256": ledger_hash(names)},
        "mediaExpected": {"objectCount": 2, "totalBytes": 200} if kind == "coordinated" else {"objectCount": 0, "totalBytes": 0},
        "consistency": {"mode": "quiesced" if kind == "coordinated" else "online", "writersStopped": kind == "coordinated" and captured, "startedAt": "2026-10-27T12:00:00Z" if captured and kind == "coordinated" else None, "endedAt": "2026-10-27T12:00:01Z" if captured and kind == "coordinated" else None, "ledgerBeforeSha256": ledger_hash(names) if captured else None, "ledgerAfterSha256": ledger_hash(names) if captured else None, "evidenceSha256": digest if captured and kind == "coordinated" else None},
        "encryption": {"method": "age", "keyId": "staging-key-v1"},
        "offHost": {"provider": "test-store", "objectKey": "maevelle/staging/mvl-stg-20261027T120000Z-0123456789abcdef/set"} if transferred else None,
        "verification": {"integrity": {"verifiedAt": "2026-10-27T12:00:03Z", "artifactSha256Matched": True, "offHostReadback": True} if integrity else None, "restore": {"verifiedAt": "2026-10-27T12:00:04Z", "isolated": True, "databaseName": "maevelle_restore_drill", "mediaChecked": kind == "coordinated", "reportId": "drill-1", "reportSha256": digest, "recoverySetId": "mvl-stg-20261027T120000Z-0123456789abcdef", "migrationSha256": ledger_hash(names)} if restored else None},
        "recoveryPoint": {"databaseAt": "2026-10-27T12:00:00Z" if captured else None, "mediaAt": "2026-10-27T12:00:01Z" if captured and kind == "coordinated" else None, "limitations": ["no-point-in-time-recovery", "external-effects-not-reversed"] + (["database-only-no-media"] if kind == "database-only" else [])},
    }


class ContractTests(unittest.TestCase):
    def test_valid_coordinated_set(self):
        value = fixture()
        self.assertIs(validate(value), value)
        self.assertTrue(coordinated_eligible(value))

    def test_database_only_never_coordinated_eligible(self):
        value = fixture("database-only")
        validate(value)
        self.assertFalse(coordinated_eligible(value))
        value["artifacts"]["media"] = {"name": "media.tar.age", "sizeBytes": 1, "sha256": "a" * 64}
        with self.assertRaises(ValueError):
            validate(value)

    def test_invalid_version_identity_and_checksum(self):
        for path, bad in (("formatVersion", 2), ("environment.name", "production"), ("artifacts.database.sha256", None), ("artifacts.media.name", "../secret.tar.age")):
            with self.subTest(path=path):
                value = fixture()
                part = value
                keys = path.split(".")
                for key in keys[:-1]:
                    part = part[key]
                part[keys[-1]] = bad
                with self.assertRaises(ValueError):
                    validate(value)

    def test_state_history_and_transition(self):
        value = fixture(state="candidate")
        validate(value)
        with self.assertRaises(ValueError):
            transition(value, "restore-verified", "2026-10-27T12:00:01Z")
        failed = transition(value, "failed", "2026-10-27T12:00:01Z")
        self.assertEqual(failed["state"], "failed")
        self.assertEqual(value["state"], "candidate")
        with self.assertRaises(ValueError):
            transition(failed, "captured", "2026-10-27T12:00:02Z")
        captured_fixture = fixture(state="captured")
        captured = transition(value, "captured", "2026-10-27T12:00:01Z", {
            key: captured_fixture[key] for key in ("capture", "artifacts", "mediaExpected", "consistency", "recoveryPoint")
        })
        self.assertEqual(captured, captured_fixture)
        with self.assertRaises(ValueError):
            transition(captured, "transferred", "2026-10-27T12:00:02Z", {"environment": {"name": "production"}})
        bad = copy.deepcopy(fixture())
        bad["stateHistory"][2]["state"] = "restore-verified"
        with self.assertRaises(ValueError):
            validate(bad)

    def test_restore_proof_required(self):
        value = fixture()
        value["verification"]["restore"]["isolated"] = False
        with self.assertRaises(ValueError):
            validate(value)


if __name__ == "__main__":
    unittest.main()
