import contextlib
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from recovery import capture as capture_module
from recovery import operations, retention
from recovery import safety
from recovery.contract import validate
from recovery.storage import MountedStorage, digest
from recovery.test_contract import fixture


class FakeDriver:
    def __init__(self, names):
        self.names = names
        self.stopped = []
        self.started = []
        self.fail = None
        self.sessions = 0
        self.available = False
        self.ledger_calls = 0

    def preflight(self, snapshot): return ("18.6", 4)
    def ledger(self):
        self.ledger_calls += 1
        return self.names[:-1] if self.fail == "ledger" and self.ledger_calls > 1 else self.names
    def local_media_backend(self): pass
    def worker_media_mount(self, mount):
        if self.fail == "mount": raise ValueError("missing worker mount")
    def service_state(self, name): return "active"
    def stop(self, name):
        self.stopped.append(name)
        if self.fail == "quiesce": raise ValueError("writer failed to stop")
    def start(self, name): self.started.append(name)
    def client_sessions(self): return 1 if self.fail == "sessions" else 0
    def active_network_containers(self): return capture_module.ALLOWED_ACTIVE
    def dump(self, path):
        if self.fail == "dump": raise ValueError("pg_dump failed")
        path.write_bytes(b"PGDMP test archive")
    def inspect_dump(self, path):
        if self.fail == "archive": raise ValueError("corrupt archive")
    def encrypt(self, source, target):
        if self.fail == "encrypt": raise ValueError("encryption failed")
        target.write_bytes(b"encrypted:" + source.read_bytes())
    def verify_available(self): self.available = True


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.media = self.root / "media"
        self.media.mkdir()
        (self.media / "object").write_bytes(b"file")
        self.backups = self.root / "backups"
        self.backups.mkdir()
        self.remote = self.root / "remote"
        self.remote.mkdir()
        self.names = fixture()["migrations"]["names"]
        self.snapshot = {"identity": {"hostId": "b" * 32, "sentinelPresent": True},
                         "database": {"version": "18.6", "migrations": 51},
                         "postgresTools": {"pg_dump": "18.6"},
                         "volumes": {"media": {"mountpoint": str(self.media)}},
                         "media": {"readable": True, "fileCount": 1, "totalBytes": 4},
                         "releaseRecord": {"commitSha": fixture()["release"]["commitSha"],
                                           "imageRefs": fixture()["release"]["images"]}}
        self.config = {"hostId": "b" * 32, "releaseCommit": self.snapshot["releaseRecord"]["commitSha"],
                       "keyId": "staging-key-v1", "storage": {"provider": "mounted-filesystem", "root": str(self.remote)},
                       "retention": {"daily": 14, "weekly": 8, "approved": False}}
        original_temp = tempfile.TemporaryDirectory
        def local_temp(*args, **kwargs):
            kwargs["dir"] = self.root
            return original_temp(*args, **kwargs)
        patches = [patch.object(capture_module, "recovery_lock", contextlib.nullcontext),
                   patch.object(capture_module, "load_configuration", return_value=self.config),
                   patch.object(capture_module, "backup_root", return_value=self.backups),
                   patch.object(operations, "backup_root", return_value=self.backups),
                   patch.object(capture_module, "MountedStorage", lambda root: MountedStorage(root, require_remote=False)),
                   patch.object(capture_module.shutil, "which", return_value="/usr/bin/age"),
                   patch.object(capture_module.shutil, "disk_usage", return_value=SimpleNamespace(free=10**12)),
                   patch.object(capture_module.tempfile, "TemporaryDirectory", local_temp)]
        for item in patches:
            item.start(); self.addCleanup(item.stop)

    def execute(self, kind="coordinated", driver=None):
        planned = capture_module.plan(self.snapshot, self.config, kind)
        return capture_module.capture(kind, planned["planId"], lambda: self.snapshot, driver or FakeDriver(self.names),
                                      storage_factory=lambda root: MountedStorage(root, require_remote=False))

    def test_database_only_and_coordinated_capture(self):
        db = self.execute("database-only")
        coordinated_driver = FakeDriver(self.names)
        coordinated = self.execute(driver=coordinated_driver)
        for result in (db, coordinated):
            manifest = validate(json.loads((self.backups / result["recoverySetId"] / "manifest.json").read_text()))
            self.assertEqual(manifest["state"], "captured")
            self.assertEqual(manifest["release"]["commitSha"], self.snapshot["releaseRecord"]["commitSha"])
            self.assertTrue(operations.inspect_set(result["recoverySetId"])["localIntegrity"])
        self.assertEqual(coordinated_driver.stopped, ["worker", "api"])
        self.assertEqual(coordinated_driver.started, ["api", "worker"])
        self.assertTrue(coordinated_driver.available)
        self.assertIsNone(json.loads((self.backups / db["recoverySetId"] / "manifest.json").read_text())["artifacts"]["media"])

    def test_capture_failures_leave_no_set_and_restore_writers(self):
        for failure in ("mount", "quiesce", "sessions", "dump", "archive", "encrypt", "ledger"):
            with self.subTest(failure=failure):
                driver = FakeDriver(self.names); driver.fail = failure
                with self.assertRaises(ValueError): self.execute(driver=driver)
                self.assertEqual(list(self.backups.iterdir()), [])
                if failure in ("sessions", "dump", "archive", "encrypt", "ledger"):
                    self.assertEqual(driver.started, ["api", "worker"])

    def test_media_and_interrupted_dump_restore_availability(self):
        driver = FakeDriver(self.names)
        with patch.object(capture_module, "_media_tar", side_effect=ValueError("media failed")):
            with self.assertRaises(ValueError): self.execute(driver=driver)
        self.assertEqual(driver.started, ["api", "worker"])
        self.assertEqual(list(self.backups.iterdir()), [])
        interrupted = FakeDriver(self.names)
        interrupted.dump = lambda path: (_ for _ in ()).throw(InterruptedError("interrupted"))
        with self.assertRaises(InterruptedError): self.execute(driver=interrupted)
        self.assertEqual(interrupted.started, ["api", "worker"])
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_real_driver_rejects_wrong_dump_version_and_role(self):
        driver = capture_module.CaptureDriver()
        with patch.object(driver, "sql", return_value="maevelle_staging|maevelle_staging|18.6"), patch.object(driver, "run", return_value="pg_dump (PostgreSQL) 17.0"):
            with self.assertRaises(ValueError): driver.preflight(self.snapshot)
        with patch.object(driver, "sql", return_value="maevelle_staging|postgres|18.6"):
            with self.assertRaises(ValueError): driver.preflight(self.snapshot)

    def test_missing_sentinel_wrong_host_disk_and_confirmation(self):
        self.snapshot["identity"]["sentinelPresent"] = False
        with self.assertRaises(ValueError): self.execute()
        self.snapshot["identity"]["sentinelPresent"] = True
        self.snapshot["identity"]["hostId"] = "c" * 32
        with self.assertRaises(ValueError): self.execute()
        self.snapshot["identity"]["hostId"] = "b" * 32
        with patch.object(capture_module.shutil, "disk_usage", return_value=SimpleNamespace(free=0)):
            with self.assertRaises(ValueError): self.execute()
        with self.assertRaises(ValueError):
            capture_module.capture("coordinated", "wrong", lambda: self.snapshot, FakeDriver(self.names),
                                   storage_factory=lambda root: MountedStorage(root, require_remote=False))

    def test_transfer_readback_retry_and_hash_mismatch(self):
        result = self.execute("database-only")
        set_id = result["recoverySetId"]
        with patch.object(operations, "recovery_lock", contextlib.nullcontext), patch.object(operations, "load_configuration", return_value=self.config), patch.object(operations, "backup_root", return_value=self.backups):
            completed = operations.transfer_verify(set_id, set_id, lambda: self.snapshot,
                                                    storage_factory=lambda root: MountedStorage(root, require_remote=False))
            self.assertEqual(completed["state"], "integrity-verified")
            operations.transfer_verify(set_id, set_id, lambda: self.snapshot,
                                       storage_factory=lambda root: MountedStorage(root, require_remote=False))
            (self.backups / set_id / "database.dump.age").write_bytes(b"tampered")
            with self.assertRaises(ValueError): operations.inspect_set(set_id)

    def test_interrupted_upload_preserves_local_captured_set(self):
        result = self.execute("database-only")
        set_id = result["recoverySetId"]
        class InterruptedStorage:
            provider = "mounted-filesystem"
            def __init__(self, root): pass
            def put_immutable(self, set_id, files): raise InterruptedError("upload stopped")
        with patch.object(operations, "recovery_lock", contextlib.nullcontext), patch.object(operations, "load_configuration", return_value=self.config):
            with self.assertRaises(InterruptedError):
                operations.transfer_verify(set_id, set_id, lambda: self.snapshot, storage_factory=InterruptedStorage)
        self.assertEqual(json.loads((self.backups / set_id / "manifest.json").read_text())["state"], "captured")
        self.assertEqual(list(self.remote.iterdir()), [])

    def test_storage_rejects_symlink_and_interrupted_upload(self):
        source = self.root / "source"; source.write_bytes(b"encrypted")
        storage = MountedStorage(self.remote, require_remote=False)
        set_id = fixture()["recoverySetId"]
        storage.put_immutable(set_id, {"database.dump.age": source})
        self.assertEqual(storage.readback_sha256(set_id, "database.dump.age"), digest(source))
        source.write_bytes(b"changed")
        with self.assertRaises(ValueError): storage.put_immutable(set_id, {"database.dump.age": source})
        with self.assertRaises(ValueError): storage.put_immutable("../outside", {"database.dump.age": source})

    def test_shared_lock_contention_and_wrong_runtime(self):
        lock_path = self.root / "maevelle-staging-migration.lock"
        with patch.object(safety, "LOCK_PATH", lock_path), patch.object(safety, "EXPECTED_UID", os.geteuid()), patch.dict(os.environ, {"XDG_RUNTIME_DIR": str(self.root)}):
            with safety.recovery_lock():
                with self.assertRaises(ValueError):
                    with safety.recovery_lock(): pass
        with patch.object(safety, "LOCK_PATH", lock_path), patch.object(safety, "EXPECTED_UID", os.geteuid()), patch.dict(os.environ, {"XDG_RUNTIME_DIR": "/wrong"}):
            with self.assertRaises(ValueError):
                with safety.recovery_lock(): pass

    def test_retention_requires_independent_restores_and_honors_pin(self):
        self.config["retention"] = {"daily": 2, "weekly": 0, "approved": True}
        for day in (24, 25, 26):
            manifest = fixture(state="restore-verified")
            set_id = f"mvl-stg-202610{day}T120000Z-{day:016x}"
            manifest["recoverySetId"] = set_id
            manifest["offHost"]["objectKey"] = f"maevelle/staging/{set_id}/set"
            manifest["verification"]["restore"]["recoverySetId"] = set_id
            manifest["verification"]["restore"]["reportId"] = f"drill-{day}"
            manifest["capture"]["startedAt"] = f"2026-10-{day}T12:00:00Z"
            manifest["capture"]["completedAt"] = f"2026-10-{day}T12:00:01Z"
            for index, event in enumerate(manifest["stateHistory"]): event["at"] = f"2026-10-{day}T12:00:0{index}Z"
            manifest["consistency"]["startedAt"] = f"2026-10-{day}T12:00:00Z"
            manifest["consistency"]["endedAt"] = f"2026-10-{day}T12:00:01Z"
            manifest["recoveryPoint"]["databaseAt"] = f"2026-10-{day}T12:00:00Z"
            manifest["recoveryPoint"]["mediaAt"] = f"2026-10-{day}T12:00:01Z"
            manifest["verification"]["integrity"]["verifiedAt"] = f"2026-10-{day}T12:00:03Z"
            manifest["verification"]["restore"]["verifiedAt"] = f"2026-10-{day}T12:00:04Z"
            directory = self.backups / set_id; directory.mkdir()
            for name, value in (("database.dump.age", b"database"), ("media.tar.age", b"media")):
                (directory / name).write_bytes(value)
                artifact = manifest["artifacts"]["database" if name.startswith("database") else "media"]
                artifact["sizeBytes"] = len(value); artifact["sha256"] = digest(directory / name)
            (directory / "quiescence.json").write_bytes(b"evidence")
            manifest["consistency"]["evidenceSha256"] = digest(directory / "quiescence.json")
            validate(manifest)
            (directory / "manifest.json").write_text(json.dumps(manifest))
        with patch.object(retention, "backup_root", return_value=self.backups):
            plan = retention.retention_plan(self.config)
            self.assertEqual([d["recoverySetId"] for d in plan["decisions"] if d["decision"] == "delete"], ["mvl-stg-20261024T120000Z-0000000000000018"])
            oldest = self.backups / "mvl-stg-20261024T120000Z-0000000000000018"
            (oldest / "pin.json").write_text(json.dumps({"recoverySetId": oldest.name, "reason": "pre-migration"}))
            plan = retention.retention_plan(self.config)
            self.assertEqual([d for d in plan["decisions"] if d["decision"] == "delete"], [])
            (oldest / "pin.json").unlink()
            newest_path = self.backups / "mvl-stg-20261026T120000Z-000000000000001a" / "manifest.json"
            newest_manifest = json.loads(newest_path.read_text())
            newest_manifest["verification"]["restore"]["reportId"] = "drill-25"
            newest_path.write_text(json.dumps(newest_manifest))
            plan = retention.retention_plan(self.config)
            self.assertEqual([d for d in plan["decisions"] if d["decision"] == "delete"], [])
            (oldest / "unexpected").write_text("unrelated")
            with self.assertRaises(ValueError): retention.retention_plan(self.config)

    def test_retention_rejects_wrong_confirmation_without_deletion(self):
        unrelated = self.root / "unrelated.txt"; unrelated.write_text("keep")
        with patch.object(retention, "recovery_lock", contextlib.nullcontext), patch.object(retention, "load_configuration", return_value=self.config), patch.object(retention, "backup_root", return_value=self.backups):
            with self.assertRaises(ValueError):
                retention.execute_retention("wrong", lambda: self.snapshot,
                                            storage_factory=lambda root: MountedStorage(root, require_remote=False))
        self.assertEqual(unrelated.read_text(), "keep")


if __name__ == "__main__": unittest.main()
