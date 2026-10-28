import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from recovery import inventory
from recovery.test_contract import fixture

IMAGE_DIGEST = "a" * 64


def image_ref(service):
    return f"ghcr.io/iamashrafee/maevelle-{service}@sha256:{IMAGE_DIGEST}"


class FakeReader:
    def __init__(self, root):
        self.root = root
        self.calls = []
        self.container_name = None
        self.volume_name = None
        self.query = {"name": "maevelle_staging", "version": "18.6", "migrations": 51, "extensions": ["pg_stat_statements", "pg_trgm"]}

    def run(self, *args):
        self.calls.append(args)
        if args[:2] == ("podman", "info"):
            return "true"
        if args[:2] == ("podman", "version"):
            return "4.9.3"
        if args[:3] == ("podman", "network", "inspect"):
            return json.dumps([{"name": "maevelle-staging", "driver": "bridge"}])
        if args[:3] == ("systemctl", "--user", "show"):
            return "active"
        if args[:2] == ("podman", "inspect"):
            name = args[2]
            mounts = []
            if name.endswith("-postgres"):
                mounts = [{"Type": "volume", "Name": "maevelle-staging-postgres", "Destination": "/var/lib/postgresql", "Source": str(self.root / "volumes/maevelle-staging-postgres/_data")}]
            if name.endswith("-api"):
                mounts = [{"Type": "volume", "Name": "maevelle-staging-media", "Destination": "/app/var/media", "Source": str(self.root / "volumes/maevelle-staging-media/_data")}]
            service = name.removeprefix("maevelle-staging-")
            return json.dumps([{"Name": self.container_name or name, "ImageName": image_ref(service) if service in inventory.SERVICES else f"example.invalid/{service}", "NetworkSettings": {"Networks": {"maevelle-staging": {}}}, "Mounts": mounts}])
        if args[:3] == ("podman", "volume", "inspect"):
            name = args[3]
            return json.dumps([{"Name": self.volume_name or name, "Mountpoint": str(self.root / "volumes" / name / "_data")}])
        if args[:2] == ("podman", "exec") and "node" in args:
            return json.dumps(self.query)
        if args[:2] == ("podman", "exec"):
            return f"{args[3]} (PostgreSQL) 18.6"
        raise AssertionError(f"Unexpected command: {args}")


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.uid = os.geteuid()
        self.quadlet_dir = self.root / ".config/containers/systemd"
        self.quadlet_dir.mkdir(parents=True)
        for name in inventory.CONTAINERS:
            extra = ""
            if name == "postgres":
                extra = "Volume=maevelle-staging-postgres:/var/lib/postgresql\n"
            if name == "api":
                extra = "Volume=maevelle-staging-media:/app/var/media\n"
            if name == "caddy":
                extra = "PublishPort=127.0.0.1:18080:80\n"
            image = image_ref(name) if name in inventory.SERVICES else f"example.invalid/{name}"
            (self.quadlet_dir / f"maevelle-{name}.container").write_text(
                f"[Container]\nContainerName=maevelle-staging-{name}\nNetwork=maevelle-staging\nImage={image}\n{extra}"
            )
        for name in inventory.VOLUMES.values():
            (self.root / "volumes" / name / "_data").mkdir(parents=True)
        media = self.root / "volumes/maevelle-staging-media/_data"
        (media / "public").mkdir()
        (media / "public/sample.jpg").write_bytes(b"sample")
        secret_dir = self.root / "deployment/secrets"
        secret_dir.mkdir(parents=True)
        self.env_file = secret_dir / "staging.env"
        self.env_file.write_text("STAGING_ENVIRONMENT=staging\nBETTER_AUTH_SECRET=do-not-report-this\n")
        self.env_file.chmod(0o600)
        config_dir = self.root / "deployment/config"
        config_dir.mkdir()
        (config_dir / "Caddyfile").write_text("private")
        release_dir = self.root / "deployment/releases"
        release_dir.mkdir()
        recovery = fixture()
        commit = recovery["release"]["commitSha"]
        release = {
            "formatVersion": 1, "status": "published", "commitSha": commit,
            "shortSha": commit[:12], "builtAt": "2026-10-27T12:00:00Z",
            "images": {name: {"repository": f"ghcr.io/iamashrafee/maevelle-{name}", "digest": f"sha256:{IMAGE_DIGEST}", "ref": image_ref(name)} for name in inventory.SERVICES},
            "schema": {"baselineRelease": "ccd405c1e6fa8c827307977b947a4a3dbce859f5", "migrationNames": recovery["migrations"]["names"]},
        }
        record = release_dir / "current.json"
        record.write_text(json.dumps({"outcome": "verified", "manifest": release}))
        record.chmod(0o600)
        self.reader = FakeReader(self.root)
        patches = [
            patch.object(inventory, "HOME", self.root),
            patch.object(inventory, "EXPECTED_UID", self.uid),
            patch.object(inventory, "QUADLETS", {n: self.quadlet_dir / f"maevelle-{n}.container" for n in inventory.CONTAINERS}),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def collect(self, **kwargs):
        return inventory.collect(self.reader, home=self.root, uid=self.uid, username="maevelle", host_id="b" * 32, **kwargs)

    def test_read_only_inventory_and_secret_redaction(self):
        before = sorted(str(p.relative_to(self.root)) for p in self.root.rglob("*"))
        protected_before = {str(path): path.read_bytes() for path in (self.env_file, self.root / "deployment/releases/current.json")}
        report = self.collect()
        after = sorted(str(p.relative_to(self.root)) for p in self.root.rglob("*"))
        self.assertEqual(before, after)
        self.assertEqual(protected_before, {path: Path(path).read_bytes() for path in protected_before})
        self.assertEqual(report["media"], {"readable": True, "fileCount": 1, "totalBytes": 6})
        self.assertEqual(report["database"]["migrations"], 51)
        self.assertNotIn("do-not-report-this", json.dumps(report))
        self.assertTrue(all(call[0] in ("podman", "systemctl") for call in self.reader.calls))
        self.assertFalse(any(any(word in call for word in ("start", "stop", "restart", "rm", "create", "pull")) for call in self.reader.calls))

    def test_wrong_uid_and_environment(self):
        with self.assertRaises(ValueError):
            inventory.collect(self.reader, home=self.root, uid=self.uid + 1, username="maevelle", host_id="b" * 32)
        self.env_file.write_text("STAGING_ENVIRONMENT=production\n")
        self.env_file.chmod(0o600)
        with self.assertRaises(ValueError):
            self.collect()

    def test_unsafe_paths_and_unexpected_identities(self):
        with self.assertRaises(ValueError):
            inventory.safe_path(self.root / ".." / "other", self.root)
        link = self.root / "deployment/backups"
        link.symlink_to(self.root / "volumes")
        with self.assertRaises(ValueError):
            self.collect()
        link.unlink()
        self.reader.container_name = "unrelated-app"
        with self.assertRaises(ValueError):
            self.collect()
        self.reader.container_name = None
        self.reader.volume_name = "unrelated-volume"
        with self.assertRaises(ValueError):
            self.collect()

    def test_malformed_or_corrupt_database_response(self):
        self.reader.query = {"name": "other", "version": "18.6", "migrations": 51, "extensions": []}
        with self.assertRaises(ValueError):
            self.collect()

    def test_unreadable_media_is_reported_without_claiming_a_count(self):
        with patch.object(inventory, "_count_media", side_effect=PermissionError):
            report = self.collect()
        self.assertEqual(report["media"], {"readable": False, "reason": "permission-denied"})

    def test_symlinked_media_entry_and_malformed_network_fail_closed(self):
        media = self.root / "volumes/maevelle-staging-media/_data"
        (media / "public/escape").symlink_to(self.root / "deployment/secrets/staging.env")
        with self.assertRaises(ValueError):
            self.collect()
        (media / "public/escape").unlink()

        original = self.reader.run
        def broken_network(*args):
            if args[:3] == ("podman", "network", "inspect"):
                return json.dumps(["corrupt"])
            return original(*args)
        self.reader.run = broken_network
        with self.assertRaises(ValueError):
            self.collect()
        self.reader.query = ["not", "an", "object"]
        with self.assertRaises(ValueError):
            self.collect()


if __name__ == "__main__":
    unittest.main()
