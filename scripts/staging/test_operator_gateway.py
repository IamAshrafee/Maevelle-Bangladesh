import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from staging.test_deploy import release

SCRIPTS = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gateway = load_module("operator_gateway", SCRIPTS / "staging/operator-gateway.py")
entry = load_module("operator_entry", SCRIPTS / "staging-operator-entry.py")
SHA = "a" * 40


class GatewayTests(unittest.TestCase):
    def test_fixed_protocol_rejects_arbitrary_commands_and_paths(self):
        for request in (
            {"action": "shell", "command": "id"},
            {"action": "status", "command": "id"},
            {"action": "plan", "sha": "../etc/passwd"},
            {"action": "plan", "sha": SHA, "path": "/etc/passwd"},
        ):
            with self.assertRaises(ValueError):
                gateway.validate_request(json.dumps(request).encode())
        with self.assertRaises(ValueError):
            gateway.validate_request(b"x" * (gateway.MAX_REQUEST + 1))

    def test_runs_only_as_rootless_maevelle_with_user_bus(self):
        commands = []
        def runner(command, **kwargs):
            commands.append((command, kwargs))
            return SimpleNamespace(stdout=b'{"recordedCommit":null}', stderr=b"", returncode=0)
        with patch.object(gateway.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=1001, pw_dir="/home/maevelle")), \
             patch.object(gateway.os, "geteuid", return_value=0), \
             patch.object(gateway.os.path, "isdir", return_value=True), \
             patch.object(gateway.os, "stat", return_value=SimpleNamespace(st_uid=1001)), \
             patch.object(gateway.sys, "stdout", SimpleNamespace(buffer=SimpleNamespace(write=lambda _: None))), \
             patch.object(gateway.sys, "stderr", SimpleNamespace(buffer=SimpleNamespace(write=lambda _: None))):
            self.assertEqual(gateway.execute({"action": "status"}, runner), 0)
        command, args = commands[0]
        self.assertEqual(command[:4], ["/usr/sbin/runuser", "-u", "maevelle", "--"])
        self.assertIn("XDG_RUNTIME_DIR=/run/user/1001", command)
        self.assertIn("DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus", command)
        self.assertEqual(command[-1], "/home/maevelle/deployment/tooling/staging-operator-entry.py")
        self.assertEqual(json.loads(args["input"]), {"action": "status"})

    def test_missing_authorization_or_rootless_session_refused(self):
        with patch.object(gateway.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=1001, pw_dir="/home/maevelle")), \
             patch.object(gateway.os, "geteuid", return_value=1000):
            with self.assertRaises(RuntimeError):
                gateway.execute({"action": "status"})
        with patch.object(gateway.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=1001, pw_dir="/home/maevelle")), \
             patch.object(gateway.os, "geteuid", return_value=0), \
             patch.object(gateway.os.path, "isdir", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "runtime is unavailable"):
                gateway.execute({"action": "status"})


class EntryTests(unittest.TestCase):
    def setUp(self):
        original_cwd = Path.cwd()
        self.addCleanup(os.chdir, original_cwd)
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.incoming = Path(self.temporary.name) / "incoming"
        self.tooling = Path(self.temporary.name) / "tooling"
        self.tooling.mkdir()
        self.incoming_patch = patch.object(entry, "INCOMING", self.incoming)
        self.tooling_patch = patch.object(entry, "TOOLING", self.tooling)
        self.incoming_patch.start()
        self.tooling_patch.start()
        self.addCleanup(self.incoming_patch.stop)
        self.addCleanup(self.tooling_patch.stop)

    def test_upload_validates_manifest_and_uses_private_atomic_file(self):
        manifest = release()
        self.assertEqual(entry.upload(SHA, manifest), {"uploadedCommit": SHA})
        target = self.incoming / f"{SHA}.json"
        self.assertEqual(json.loads(target.read_text()), manifest)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.incoming.stat().st_mode & 0o777, 0o700)
        with self.assertRaisesRegex(ValueError, "commit differs"):
            entry.upload("b" * 40, manifest)
        with self.assertRaisesRegex(ValueError, "digest"):
            entry.upload(SHA, {**manifest, "images": {**manifest["images"], "api": {**manifest["images"]["api"], "digest": "bad"}}})

    def test_upload_refuses_symlinked_protected_directory(self):
        other = Path(self.temporary.name) / "other"
        other.mkdir()
        self.incoming.symlink_to(other, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            entry.upload(SHA, release())
        self.assertEqual(list(other.iterdir()), [])

    def test_verify_existing_release_calls_only_executor_verify(self):
        self.incoming.mkdir()
        (self.incoming / f"{SHA}.json").write_text(json.dumps(release()))
        commands = []
        def runner(command, **kwargs):
            commands.append(command)
            return SimpleNamespace(returncode=0, stdout='{"outcome":"verified"}', stderr="")
        with patch.object(entry.pwd, "getpwuid", return_value=SimpleNamespace(pw_name="maevelle")), \
             patch.object(entry.os, "geteuid", return_value=1001), \
             patch.object(entry.Path, "home", return_value=entry.HOME):
            self.assertEqual(entry.handle({"action": "verify", "sha": SHA}, runner), {"outcome": "verified"})
        self.assertEqual(commands[0][2], "verify")
        self.assertEqual(commands[0][-2:], ["--confirm", SHA])
        self.assertFalse(any("restart" in argument for argument in commands[0]))


if __name__ == "__main__":
    unittest.main()
