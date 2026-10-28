import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from staging.auto import check, download
from staging.execute import json_record, state_directory
from staging.manifest import SERVICES
from staging.test_deploy import FakeHost, release

REF = "ghcr.io/iamashrafee/maevelle-release@sha256:" + "c" * 64
SHA = "a" * 40


class AutoDeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.host = FakeHost(self.home)
        self.runtime = self.home / "runtime"
        self.runtime.mkdir()
        env = patch.dict(os.environ, {"XDG_RUNTIME_DIR": str(self.runtime)})
        env.start()
        self.addCleanup(env.stop)
        identity = patch("staging.auto.pwd.getpwuid", return_value=SimpleNamespace(pw_name="maevelle"))
        identity.start()
        self.addCleanup(identity.stop)
        home = patch("staging.auto.HOME", self.home)
        home.start()
        self.addCleanup(home.stop)
        self.state = self.home / "deployment/releases/auto-deploy.json"
        self.registry = SimpleNamespace(latest=lambda: (12, SHA[:12], REF))
        self.manifest = release(SERVICES)
        self.events = []

    def run_check(self, **kwargs):
        return check(host=self.host, registry=self.registry, fetch=lambda *args: self.manifest,
                     state_path=self.state, log=self.events.append, **kwargs)

    def test_new_valid_release_deploys_and_records_success(self):
        result = self.run_check()
        self.assertEqual(result["outcome"], "verified")
        self.assertEqual(json.loads(self.state.read_text())["appliedSequence"], 12)
        self.assertEqual(json.loads((state_directory(self.host) / "current.json").read_text())["manifest"]["commitSha"], SHA)
        self.assertFalse(any(call[:2] == ("systemctl", "--user") and any(name in call for name in ("maevelle-postgres.service", "maevelle-caddy.service")) for call in self.host.calls))

    def test_already_running_release_does_not_restart(self):
        for name in SERVICES:
            path = self.host.quadlets[name]
            path.write_text(path.read_text().replace(self.host.refs[name], self.manifest["images"][name]["ref"]))
            self.host.refs[name] = self.manifest["images"][name]["ref"]
        directory = state_directory(self.host)
        directory.mkdir(parents=True)
        json_record(directory / "current.json", {"outcome": "verified", "manifest": self.manifest})
        self.assertEqual(self.run_check()["outcome"], "already-current")
        self.assertFalse(any(call[:3] == ("systemctl", "--user", "restart") for call in self.host.calls))

    def test_manual_verified_release_clears_held_failure(self):
        for name in SERVICES:
            path = self.host.quadlets[name]
            path.write_text(path.read_text().replace(self.host.refs[name], self.manifest["images"][name]["ref"]))
            self.host.refs[name] = self.manifest["images"][name]["ref"]
        directory = state_directory(self.host)
        directory.mkdir(parents=True)
        json_record(directory / "current.json", {"outcome": "verified", "manifest": self.manifest})
        json_record(self.state, {"failedRef": REF})
        self.assertEqual(self.run_check()["outcome"], "already-current")
        self.assertIsNone(json.loads(self.state.read_text())["failedRef"])

    def test_no_ready_release(self):
        self.registry.latest = lambda: None
        self.assertEqual(self.run_check()["outcome"], "no-release")

    def test_out_of_order_pipeline_is_ignored(self):
        self.state.parent.mkdir(parents=True)
        json_record(self.state, {"appliedSequence": 13, "appliedCommit": "b" * 40})
        self.assertEqual(self.run_check()["outcome"], "older-release")

    def test_older_build_time_cannot_replace_manual_newer_release(self):
        current = release()
        current["commitSha"] = "b" * 40
        current["shortSha"] = "b" * 12
        current["builtAt"] = "2026-10-28T10:00:00.000Z"
        directory = state_directory(self.host)
        directory.mkdir(parents=True)
        json_record(directory / "current.json", {"outcome": "verified", "manifest": current})
        self.assertEqual(self.run_check()["outcome"], "older-release")

    def test_pending_migration_blocks_without_apply(self):
        self.manifest = release(SERVICES, pending=("5100_next",))
        self.assertEqual(self.run_check()["outcome"], "migration-blocked")
        self.assertFalse(any(call[:3] == ("systemctl", "--user", "restart") for call in self.host.calls))

    def test_bad_manifest_or_private_ghcr_error_does_not_apply(self):
        for error in (ValueError("Invalid release digest"), RuntimeError("GHCR login rejected")):
            with self.assertRaisesRegex(Exception, str(error)):
                check(host=self.host, registry=self.registry, fetch=lambda *args: (_ for _ in ()).throw(error),
                      state_path=self.state, log=self.events.append)
            self.assertEqual(json.loads(self.state.read_text())["failedRef"], REF)
            self.state.unlink()

    def test_failed_rollout_is_held_until_manual_review(self):
        self.host.fail_ready = True
        with self.assertRaisesRegex(RuntimeError, "readiness"):
            self.run_check()
        self.assertEqual(json.loads(self.state.read_text())["failedRef"], REF)
        self.host.calls.clear()
        self.assertEqual(self.run_check()["outcome"], "failed-release-held")
        self.assertFalse(any(call[0] == "pull" for call in self.host.calls))

    def test_preflight_does_not_apply(self):
        self.assertEqual(self.run_check(dry_run=True)["outcome"], "ready")
        self.assertFalse(self.state.exists())
        self.assertFalse(any(call[:3] == ("systemctl", "--user", "restart") for call in self.host.calls))

    def test_metadata_image_digest_mismatch_is_refused(self):
        class ImageHost:
            def run(self, *args, **kwargs):
                return "[]" if args[:3] == ("podman", "image", "inspect") else ""
        with self.assertRaisesRegex(RuntimeError, "digest mismatch"):
            download(REF, SHA[:12], ImageHost())

    def test_existing_deployment_lock_blocks(self):
        lock = self.runtime / "maevelle-staging-migration.lock"
        lock.touch()
        with lock.open("r+") as stream:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, "holds the lock"):
                self.run_check()
