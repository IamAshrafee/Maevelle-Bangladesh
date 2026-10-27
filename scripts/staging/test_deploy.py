import fcntl
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
import urllib.error
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from staging.execute import apply_release, reconcile_release, state_directory
from staging.host import CONTAINERS, Host, LedgerError, ReadinessError
from staging.manifest import SERVICES, load, validate
from staging.plan import build_plan
from staging.quadlet import inspect

REPOSITORY = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted(json.loads((REPOSITORY / "packages/database/migration-history-baseline.json").read_text())["migrations"])
OLD = {service: f"ghcr.io/iamashrafee/maevelle-{service}@sha256:{'1' * 64}" for service in SERVICES}


def release(changed=(), pending=()):
    images = {}
    for service in SERVICES:
        repository = f"ghcr.io/iamashrafee/maevelle-{service}"
        digest = f"sha256:{'2' * 64}" if service in changed else f"sha256:{'1' * 64}"
        images[service] = {"repository": repository, "digest": digest, "ref": f"{repository}@{digest}"}
    return validate({
        "formatVersion": 1, "status": "published", "commitSha": "a" * 40,
        "shortSha": "a" * 12, "builtAt": "2026-10-27T10:00:00.000Z",
        "images": images,
        "schema": {"migrationNames": MIGRATIONS + list(pending), "baselineRelease": "ccd405c1e6fa8c827307977b947a4a3dbce859f5"},
    })


class FakeHost(Host):
    def __init__(self, home):
        super().__init__(home)
        self.calls = []
        self.refs = OLD.copy()
        self.states = {name: "active" for name in CONTAINERS}
        self.applied = MIGRATIONS.copy()
        self.fail_pull = False
        self.fail_ready = False
        self.fail_ready_once = False
        quadlet_dir = home / ".config/containers/systemd"
        quadlet_dir.mkdir(parents=True)
        (home / "deployment/secrets").mkdir(parents=True)
        (home / "deployment/config").mkdir(parents=True)
        (home / "deployment/secrets/staging.env").write_text("synthetic only\n")
        (home / "deployment/secrets/staging.env").chmod(0o600)
        (home / "deployment/config/Caddyfile").write_text("synthetic only\n")
        (quadlet_dir / "maevelle.network").write_text("[Network]\nNetworkName=maevelle-staging\nDriver=bridge\n")
        (quadlet_dir / "maevelle-postgres.volume").write_text("[Volume]\nVolumeName=maevelle-staging-postgres\n")
        (quadlet_dir / "maevelle-media.volume").write_text("[Volume]\nVolumeName=maevelle-staging-media\n")
        for name in CONTAINERS:
            image = OLD.get(name, f"docker.io/library/{name}@sha256:{'1' * 64}")
            extra = "Volume=maevelle-postgres.volume:/var/lib/postgresql\n" if name == "postgres" else "Volume=maevelle-media.volume:/app/var/media\n" if name == "api" else "PublishPort=127.0.0.1:18080:80\n" if name == "caddy" else ""
            self.quadlets[name].write_text(
                f"[Container]\nContainerName={CONTAINERS[name]}\nNetwork=maevelle.network\nImage={image}\n{extra}Environment=KEEP=1\n[Service]\nRestart=always\n"
            )

    def verify_identity(self):
        for name in CONTAINERS:
            inspect(self.quadlets[name], CONTAINERS[name])

    def service_states(self):
        return self.states.copy()

    def quadlet_refs(self):
        return {service: inspect(self.quadlets[service], CONTAINERS[service])[1] for service in SERVICES}

    def container_refs(self):
        return self.refs.copy()

    def ledger(self):
        return self.applied.copy()

    def pull_verified(self, ref, commit_sha):
        self.calls.append(("pull", ref))
        if self.fail_pull:
            raise RuntimeError("synthetic image pull failed")

    def run(self, *args, timeout=30):
        self.calls.append(args)
        if args[:3] == ("systemctl", "--user", "restart"):
            name = args[3].removeprefix("maevelle-").removesuffix(".service")
            self.refs[name] = self.quadlet_refs()[name]
        elif args[:3] == ("systemctl", "--user", "stop"):
            self.states["worker"] = "inactive"
        elif args[:3] == ("systemctl", "--user", "start"):
            self.states["worker"] = "active"
            self.refs["worker"] = self.quadlet_refs()["worker"]
        return "active"

    def verify_service(self, name, ref, seconds=90):
        self.calls.append(("ready", name))
        if self.fail_ready_once and name == "api":
            self.fail_ready_once = False
            raise RuntimeError("synthetic transient API readiness failure")
        if self.fail_ready and name == "api":
            raise RuntimeError("synthetic API readiness failure")
        if self.refs[name] != ref:
            raise RuntimeError("wrong running image")

    def verify_gateway_routes(self, seconds=60):
        self.calls.append(("gateway",))


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="maevelle-deploy-")
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.host = FakeHost(self.home)
        self.runtime = self.home / "runtime"
        self.runtime.mkdir()
        self.environment = patch.dict(os.environ, {"XDG_RUNTIME_DIR": str(self.runtime)})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def set_running_release(self, manifest):
        for name in SERVICES:
            path = self.host.quadlets[name]
            ref = manifest["images"][name]["ref"]
            path.write_text(path.read_text().replace(OLD[name], ref))
            self.host.refs[name] = ref

    def test_reconcile_matching_release_preserves_failed_attempt_and_all_services(self):
        manifest = release(SERVICES)
        self.set_running_release(manifest)
        directory = state_directory(self.host)
        directory.mkdir(parents=True)
        failed = {"id": "failed-123", "outcome": "failed", "targetCommit": manifest["commitSha"], "failedStep": "release verification"}
        (directory / "latest-attempt.json").write_text(json.dumps(failed))
        before = {name: path.read_bytes() for name, path in self.host.quadlets.items()}
        result = reconcile_release(manifest, self.host, manifest["commitSha"])
        self.assertEqual(result["outcome"], "verified")
        self.assertEqual(result["verificationMethod"], "reconciliation")
        self.assertEqual(result["relatedFailedAttemptId"], "failed-123")
        self.assertEqual(result["checks"]["appliedMigrations"], 51)
        self.assertEqual(json.loads((directory / "latest-attempt.json").read_text()), failed)
        self.assertEqual(json.loads((directory / "current.json").read_text()), result)
        self.assertEqual(before, {name: path.read_bytes() for name, path in self.host.quadlets.items()})
        self.assertFalse(any(call[0] in ("pull", "systemctl", "podman") for call in self.host.calls))
        self.assertIn(("gateway",), self.host.calls)

    def test_reconcile_rejects_wrong_confirmation_and_bad_manifest(self):
        manifest = release(SERVICES)
        self.set_running_release(manifest)
        with self.assertRaisesRegex(RuntimeError, "full target commit SHA"):
            reconcile_release(manifest, self.host, "b" * 40)
        with self.assertRaisesRegex(ValueError, "digest"):
            reconcile_release({**manifest, "images": {**manifest["images"], "api": {**manifest["images"]["api"], "digest": "invalid"}}}, self.host, manifest["commitSha"])
        with self.assertRaises(FileNotFoundError):
            load(self.home / "missing-release.json")
        self.assertFalse(state_directory(self.host).exists())

    def test_reconcile_rejects_running_and_quadlet_digest_mismatch(self):
        manifest = release(SERVICES)
        self.set_running_release(manifest)
        self.host.refs["api"] = OLD["api"]
        with self.assertRaisesRegex(RuntimeError, "running release digest mismatch"):
            reconcile_release(manifest, self.host, manifest["commitSha"])
        self.host.refs["api"] = manifest["images"]["api"]["ref"]
        path = self.host.quadlets["api"]
        path.write_text(path.read_text().replace(self.host.refs["api"], OLD["api"]))
        with self.assertRaisesRegex(RuntimeError, "Quadlet release digest mismatch"):
            reconcile_release(manifest, self.host, manifest["commitSha"])
        self.assertFalse(state_directory(self.host).exists())

    def test_reconcile_rejects_inactive_service_and_migration_mismatch(self):
        manifest = release(SERVICES)
        self.set_running_release(manifest)
        self.host.states["worker"] = "inactive"
        with self.assertRaisesRegex(RuntimeError, "worker service not started"):
            reconcile_release(manifest, self.host, manifest["commitSha"])
        self.host.states["worker"] = "active"
        self.host.applied = MIGRATIONS[:-1]
        with self.assertRaisesRegex(RuntimeError, "migration ledger does not exactly match"):
            reconcile_release(manifest, self.host, manifest["commitSha"])
        self.assertFalse(state_directory(self.host).exists())

    def test_reconcile_lock_contention_and_existing_verified_release(self):
        manifest = release(SERVICES)
        self.set_running_release(manifest)
        with (self.runtime / "maevelle-staging-migration.lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, "holds the lock"):
                reconcile_release(manifest, self.host, manifest["commitSha"])
        first = reconcile_release(manifest, self.host, manifest["commitSha"])
        current_path = state_directory(self.host) / "current.json"
        contents = current_path.read_bytes()
        second = reconcile_release(manifest, self.host, manifest["commitSha"])
        self.assertEqual(second["verifiedAt"], first["verifiedAt"])
        self.assertTrue(second["alreadyVerified"])
        self.assertEqual(current_path.read_bytes(), contents)

    def test_reconcile_permanent_readiness_failure_records_no_success(self):
        manifest = release(SERVICES)
        self.set_running_release(manifest)
        self.host.fail_ready = True
        with self.assertRaisesRegex(RuntimeError, "readiness failure"):
            reconcile_release(manifest, self.host, manifest["commitSha"])
        self.assertFalse(state_directory(self.host).exists())

    def test_api_readiness_recovers_and_permanent_failure_is_specific(self):
        probes = []

        def inspect_runtime(*args, timeout=30):
            return "true" if args[3] == "{{.State.Running}}" else OLD["api"]

        def http(path, label, allow_redirect=False):
            probes.append(path)
            if path == "/api/health/ready" and probes.count(path) == 1:
                raise ReadinessError("API database readiness failure (HTTP 503)")

        with patch.object(self.host, "run", side_effect=inspect_runtime), patch.object(self.host, "check_http", side_effect=http), patch("staging.host.time.sleep"):
            Host.verify_service(self.host, "api", OLD["api"], seconds=1)
        self.assertEqual(probes.count("/api/health/ready"), 2)
        with patch.object(self.host, "run", side_effect=inspect_runtime), patch.object(self.host, "check_http", side_effect=ReadinessError("API database readiness failure (HTTP 503)")):
            with self.assertRaisesRegex(RuntimeError, "database readiness failure"):
                Host.verify_service(self.host, "api", OLD["api"], seconds=0)

    def test_http_diagnostics_distinguish_api_and_database_failure(self):
        upstream = urllib.error.HTTPError("http://127.0.0.1", 502, "unavailable", None, None)
        with patch("staging.host.urllib.request.urlopen", side_effect=upstream):
            with self.assertRaisesRegex(ReadinessError, "API not listening yet"):
                Host.check_http(self.host, "/api/health/live", "API liveness")
        upstream.close()
        database = urllib.error.HTTPError("http://127.0.0.1", 503, "unavailable", None, None)
        with patch("staging.host.urllib.request.urlopen", side_effect=database):
            with self.assertRaisesRegex(ReadinessError, "database readiness failure"):
                Host.check_http(self.host, "/api/health/ready", "API readiness")
        database.close()

    def test_ledger_retry_and_sanitized_exec_diagnostics(self):
        with patch.object(self.host, "ledger", side_effect=[LedgerError("migration ledger DNS unavailable", True), MIGRATIONS.copy()]), patch("staging.host.time.sleep"):
            self.assertEqual(Host.ledger_ready(self.host, seconds=1), MIGRATIONS)
        outcome = subprocess.CompletedProcess(["podman", "exec"], 1, "", "MAEVELLE_LEDGER_ERROR:DNS_UNAVAILABLE password=synthetic-secret")
        with patch("staging.host.subprocess.run", return_value=outcome):
            with self.assertRaises(LedgerError) as caught:
                Host.run(self.host, "podman", "exec", "synthetic")
        self.assertTrue(caught.exception.transient)
        self.assertNotIn("synthetic-secret", str(caught.exception))

    def test_apply_retries_transient_final_ledger_failure(self):
        manifest = release(("admin",))
        with patch.object(self.host, "ledger", side_effect=[MIGRATIONS.copy(), LedgerError("migration ledger DNS unavailable", True), MIGRATIONS.copy()]), patch("staging.host.time.sleep"):
            result = apply_release(manifest, self.host, manifest["commitSha"])
        self.assertEqual(result["outcome"], "verified")
        self.assertEqual(result["checks"]["appliedMigrations"], 51)

    def test_apply_preserves_failed_final_verification_after_rollout(self):
        manifest = release(("admin",))
        with patch.object(self.host, "ledger", side_effect=[MIGRATIONS.copy(), LedgerError("migration ledger table missing", False)]):
            with self.assertRaisesRegex(RuntimeError, "ledger table missing"):
                apply_release(manifest, self.host, manifest["commitSha"])
        directory = state_directory(self.host)
        attempt = json.loads((directory / "latest-attempt.json").read_text())
        self.assertEqual(attempt["failedStep"], "release verification")
        self.assertTrue(attempt["rolloutCompleted"])
        self.assertFalse((directory / "current.json").exists())

    @contextmanager
    def mocked_runtime(self, network="maevelle-staging", attachment="maevelle-staging"):
        calls = []

        def run(*args, timeout=30):
            calls.append(args)
            if args[:3] == ("podman", "network", "inspect"):
                return json.dumps([{"name": network, "driver": "bridge"}])
            if args[:3] == ("podman", "inspect", "--format") and args[3] == "{{.State.Running}}":
                return "true"
            if args[:3] == ("podman", "inspect", "--format") and args[3] == "{{json .NetworkSettings.Networks}}":
                return json.dumps({attachment: {}})
            return "true"

        with patch("staging.host.HOME", self.home), patch("staging.host.pwd.getpwuid", return_value=SimpleNamespace(pw_name="maevelle")), patch.object(self.host, "run", side_effect=run):
            yield calls

    def test_network_reference_resolves_expected_runtime_network(self):
        with self.mocked_runtime() as calls:
            Host.verify_identity(self.host)
        self.assertEqual(len([call for call in calls if call[:3] == ("podman", "network", "inspect")]), 1)

    def test_network_resource_mismatch_and_missing_file_are_rejected(self):
        network_file = self.home / ".config/containers/systemd/maevelle.network"
        network_file.write_text("[Network]\nNetworkName=other-app\n")
        with self.mocked_runtime(), self.assertRaisesRegex(ValueError, "does not resolve"):
            Host.verify_identity(self.host)
        network_file.unlink()
        with self.mocked_runtime(), self.assertRaisesRegex(ValueError, "Missing or unsafe"):
            Host.verify_identity(self.host)

    def test_network_resource_requires_unambiguous_name(self):
        network_file = self.home / ".config/containers/systemd/maevelle.network"
        network_file.write_text("[Network]\nNetworkName=maevelle-staging\nNetworkName=other-app\n")
        with self.mocked_runtime(), self.assertRaisesRegex(ValueError, "exactly one"):
            Host.verify_identity(self.host)

    def test_unexpected_runtime_network_and_attachment_are_rejected(self):
        with self.mocked_runtime(network="other-app"), self.assertRaisesRegex(RuntimeError, "network identity"):
            Host.verify_identity(self.host)
        with self.mocked_runtime(attachment="other-app"), self.assertRaisesRegex(RuntimeError, "network attachment"):
            Host.verify_identity(self.host)

    def test_unrelated_or_ambiguous_network_declarations_are_rejected(self):
        path = self.host.quadlets["api"]
        original = path.read_text()
        path.write_text(original.replace("Network=maevelle.network", "Network=other.network"))
        with self.assertRaisesRegex(ValueError, "does not resolve"):
            inspect(path, CONTAINERS["api"])
        path.write_text(original.replace("Network=maevelle.network", "Network=maevelle.network\nNetwork=maevelle-staging"))
        with self.assertRaisesRegex(ValueError, "exactly one"):
            inspect(path, CONTAINERS["api"])

    def test_postgres_and_caddy_use_same_network_resolution(self):
        for name in ("postgres", "caddy"):
            path = self.host.quadlets[name]
            path.write_text(path.read_text().replace("Network=maevelle.network", "Network=unrelated.network"))
            with self.mocked_runtime(), self.assertRaisesRegex(ValueError, "does not resolve"):
                Host.verify_identity(self.host)
            path.write_text(path.read_text().replace("Network=unrelated.network", "Network=maevelle.network"))

    def test_volume_resource_reference_requires_expected_volume_name(self):
        volume_file = self.home / ".config/containers/systemd/maevelle-media.volume"
        volume_file.write_text("[Volume]\nVolumeName=unrelated-media\n")
        with self.mocked_runtime(), self.assertRaisesRegex(RuntimeError, "persistent media volume"):
            Host.verify_identity(self.host)
        volume_file.unlink()
        with self.mocked_runtime(), self.assertRaisesRegex(ValueError, "Missing or unsafe"):
            Host.verify_identity(self.host)

    def test_admin_only_plan_is_read_only_and_preserves_other_config(self):
        before = {name: path.read_bytes() for name, path in self.host.quadlets.items()}
        plan = build_plan(release(("admin",)), self.host)
        self.assertEqual(plan.changed, ("admin",))
        self.assertEqual(plan.selected, ("admin",))
        self.assertEqual(plan.pending, ())
        self.assertEqual(before, {name: path.read_bytes() for name, path in self.host.quadlets.items()})
        self.assertFalse(state_directory(self.host).exists())
        self.assertEqual(self.host.calls, [])

    def test_status_observes_existing_deployment_without_release_record(self):
        script = REPOSITORY / "scripts/staging-deploy.py"
        specification = importlib.util.spec_from_file_location("maevelle_staging_cli", script)
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        before = {name: path.read_bytes() for name, path in self.host.quadlets.items()}
        with self.mocked_runtime() as calls, patch.object(self.host, "verify_identity", side_effect=lambda: Host.verify_identity(self.host)):
            result = module.status(self.host)
        self.assertIsNone(result["recordedCommit"])
        self.assertIsNone(result["lastVerifiedAt"])
        self.assertEqual(result["appliedMigrations"], 51)
        self.assertEqual(result["quadletImageRefs"], OLD)
        self.assertEqual(before, {name: path.read_bytes() for name, path in self.host.quadlets.items()})
        self.assertFalse(state_directory(self.host).exists())
        self.assertEqual(self.host.calls, [])
        self.assertFalse(any(call[:2] in (("podman", "pull"), ("systemctl", "--user")) for call in calls))

    def test_api_change_coordinates_all_apps_and_pending_migration_blocks_apply(self):
        plan = build_plan(release(("api",), ("3300_example",)), self.host)
        self.assertEqual(plan.selected, ("api", "admin", "storefront", "worker"))
        self.assertEqual(plan.pending, ("3300_example",))
        with self.assertRaisesRegex(RuntimeError, "Pending migrations"):
            apply_release(release(("api",), ("3300_example",)), self.host, "a" * 40)
        self.assertFalse(state_directory(self.host).exists())

    def test_wrong_target_identity_and_running_image_fail_closed(self):
        path = self.host.quadlets["api"]
        path.write_text(path.read_text().replace("ContainerName=maevelle-staging-api", "ContainerName=other-app"))
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            build_plan(release(("api",)), self.host)
        path.write_text(path.read_text().replace("ContainerName=other-app", "ContainerName=maevelle-staging-api"))
        self.host.refs["api"] = "unverified:latest"
        with self.assertRaisesRegex(RuntimeError, "differs from its Quadlet"):
            build_plan(release(("api",)), self.host)

    def test_lock_contention_prevents_changes(self):
        with (self.runtime / "maevelle-staging-migration.lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, "holds the lock"):
                apply_release(release(("admin",)), self.host, "a" * 40)
        self.assertFalse(state_directory(self.host).exists())

    def test_failed_pull_preserves_quadlets_and_records_diagnostic(self):
        self.host.fail_pull = True
        before = {name: path.read_bytes() for name, path in self.host.quadlets.items()}
        with self.assertRaisesRegex(RuntimeError, "pull failed"):
            apply_release(release(("admin",)), self.host, "a" * 40)
        self.assertEqual(before, {name: path.read_bytes() for name, path in self.host.quadlets.items()})
        latest = json.loads((state_directory(self.host) / "latest-attempt.json").read_text())
        self.assertEqual(latest["outcome"], "failed")
        self.assertEqual(latest["failedStep"], "pull")
        self.assertFalse((state_directory(self.host) / "current.json").exists())

    def test_success_updates_only_admin_and_records_verified_release(self):
        before = {name: path.read_bytes() for name, path in self.host.quadlets.items()}
        result = apply_release(release(("admin",)), self.host, "a" * 40)
        self.assertEqual(result["outcome"], "verified")
        self.assertEqual(self.host.quadlets["postgres"].read_bytes(), before["postgres"])
        self.assertEqual(self.host.quadlets["caddy"].read_bytes(), before["caddy"])
        self.assertEqual(self.host.quadlets["api"].read_bytes(), before["api"])
        self.assertEqual(self.host.quadlets["worker"].read_bytes(), before["worker"])
        admin_before = before["admin"].decode()
        admin_after = self.host.quadlets["admin"].read_text()
        self.assertEqual(admin_before.replace(OLD["admin"], release(("admin",))["images"]["admin"]["ref"]), admin_after)
        self.assertEqual([call for call in self.host.calls if call[:3] == ("systemctl", "--user", "restart")], [("systemctl", "--user", "restart", "maevelle-admin.service")])

    def test_readiness_failure_keeps_backup_and_no_success_record(self):
        self.host.fail_ready = True
        postgres = self.host.quadlets["postgres"].read_bytes()
        caddy = self.host.quadlets["caddy"].read_bytes()
        with self.assertRaisesRegex(RuntimeError, "readiness failure"):
            apply_release(release(("api",)), self.host, "a" * 40)
        directory = state_directory(self.host)
        latest = json.loads((directory / "latest-attempt.json").read_text())
        self.assertEqual(latest["outcome"], "failed")
        self.assertEqual(latest["failedStep"], "service restart/readiness")
        self.assertTrue((Path(latest["backupDirectory"]) / "maevelle-api.container").is_file())
        self.assertFalse((directory / "current.json").exists())
        self.assertEqual(self.host.quadlets["postgres"].read_bytes(), postgres)
        self.assertEqual(self.host.quadlets["caddy"].read_bytes(), caddy)


if __name__ == "__main__":
    unittest.main()
