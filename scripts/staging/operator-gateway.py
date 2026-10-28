#!/usr/bin/python3 -I
"""Root-owned sudo entrypoint. Install separately; accepts one fixed JSON protocol."""

import json
import os
import pwd
import re
import subprocess
import sys

USER = "maevelle"
UID = 1001
ENTRY = "/home/maevelle/deployment/tooling/staging-operator-entry.py"
SHA = re.compile(r"[a-f0-9]{40}\Z")
MAX_REQUEST = 128 * 1024


def validate_request(raw: bytes) -> dict:
    if len(raw) > MAX_REQUEST:
        raise ValueError("Operator request exceeds size limit")
    request = json.loads(raw)
    if not isinstance(request, dict):
        raise ValueError("Operator request must be an object")
    action = request.get("action")
    expected = {"action"} if action == "status" else {"action", "sha", "manifest"} if action == "upload" else {"action", "sha"}
    if action not in ("status", "upload", "plan", "apply", "verify") or set(request) != expected:
        raise ValueError("Unsupported operator action or arguments")
    if action != "status" and (not isinstance(request["sha"], str) or not SHA.fullmatch(request["sha"])):
        raise ValueError("Operator release SHA is invalid")
    if action == "upload" and not isinstance(request["manifest"], dict):
        raise ValueError("Operator manifest must be an object")
    return request


def execute(request: dict, runner=subprocess.run) -> int:
    account = pwd.getpwnam(USER)
    if os.geteuid() != 0 or account.pw_uid != UID or account.pw_dir != "/home/maevelle":
        raise RuntimeError("Maevelle operator gateway identity check failed")
    runtime = f"/run/user/{UID}"
    if not os.path.isdir(runtime) or os.stat(runtime).st_uid != UID:
        raise RuntimeError("Maevelle rootless user runtime is unavailable")
    payload = json.dumps(request, separators=(",", ":")).encode()
    command = [
        "/usr/sbin/runuser", "-u", USER, "--", "/usr/bin/env", "-i",
        "HOME=/home/maevelle", "USER=maevelle", "LOGNAME=maevelle",
        f"XDG_RUNTIME_DIR={runtime}",
        f"DBUS_SESSION_BUS_ADDRESS=unix:path={runtime}/bus",
        "PATH=/usr/local/bin:/usr/bin:/bin", "/usr/bin/python3", ENTRY,
    ]
    result = runner(command, input=payload, capture_output=True, timeout=600, check=False)
    sys.stdout.buffer.write(result.stdout)
    sys.stderr.buffer.write(result.stderr)
    return result.returncode


def main() -> int:
    try:
        if len(sys.argv) != 1:
            raise ValueError("Operator gateway accepts no command arguments")
        raw = sys.stdin.buffer.read(MAX_REQUEST + 1)
        return execute(validate_request(raw))
    except (ValueError, json.JSONDecodeError, KeyError, RuntimeError, OSError, subprocess.TimeoutExpired):
        print("Maevelle operator request refused; check authorization, request and rootless user session", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
