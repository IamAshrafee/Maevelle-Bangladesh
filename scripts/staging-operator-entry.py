#!/usr/bin/env python3
"""Maevelle-owned fixed-action adapter for the installed Phase 03 executor."""

import json
import os
import pwd
import re
import subprocess
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
from staging.manifest import validate

HOME = Path("/home/maevelle")
TOOLING = HOME / "deployment/tooling"
INCOMING = HOME / "deployment/releases/incoming"
EXECUTOR = TOOLING / "staging-deploy.py"
SHA = re.compile(r"[a-f0-9]{40}\Z")


def release_path(sha: str) -> Path:
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("Invalid release SHA")
    return INCOMING / f"{sha}.json"


def upload(sha: str, manifest: dict) -> dict:
    validate(manifest)
    if manifest["commitSha"] != sha:
        raise ValueError("Manifest commit differs from requested release")
    if INCOMING.is_symlink() or INCOMING.parent.is_symlink():
        raise ValueError("Release input path must not be a symlink")
    INCOMING.mkdir(mode=0o700, parents=True, exist_ok=True)
    INCOMING.chmod(0o700)
    destination = release_path(sha)
    temporary = INCOMING / f".{sha}.{uuid.uuid4().hex}.tmp"
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump(manifest, stream, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {"uploadedCommit": sha}


def handle(request: dict, runner=subprocess.run) -> dict:
    if pwd.getpwuid(os.geteuid()).pw_name != "maevelle" or Path.home() != HOME:
        raise RuntimeError("Operator entry must run as maevelle")
    action = request["action"]
    if action == "upload":
        return upload(request["sha"], request["manifest"])
    command = ["/usr/bin/python3", str(EXECUTOR), action]
    if action != "status":
        path = release_path(request["sha"])
        if path.is_symlink() or not path.is_file():
            raise ValueError("Release manifest is missing or is a symlink")
        command += ["--release", str(path)]
        if action in ("apply", "verify"):
            command += ["--confirm", request["sha"]]
    os.chdir(TOOLING)
    result = runner(command, capture_output=True, text=True, timeout=600, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[:1200] or "Maevelle executor failed")
    return json.loads(result.stdout)


def main() -> int:
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict) or request.get("action") not in ("status", "upload", "plan", "apply", "verify"):
            raise ValueError("Unsupported operator request")
        print(json.dumps(handle(request), separators=(",", ":")))
        return 0
    except (ValueError, RuntimeError, OSError, KeyError, json.JSONDecodeError, subprocess.TimeoutExpired) as error:
        print(f"Maevelle operator failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
