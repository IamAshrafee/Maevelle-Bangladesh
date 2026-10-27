#!/usr/bin/env python3
"""Operator-triggered Maevelle rootless staging status, plan, and deployment."""

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from staging.execute import apply_release, read_record, state_directory
from staging.host import Host
from staging.manifest import load
from staging.plan import build_plan


def status(host: Host, target: dict | None = None) -> dict:
    host.verify_identity()
    directory = state_directory(host)
    current = read_record(directory / "current.json")
    last = read_record(directory / "latest-attempt.json")
    states = host.service_states()
    quadlets = host.quadlet_refs()
    running = host.container_refs()
    ledger = host.ledger()
    result = {
        "recordedCommit": current["manifest"]["commitSha"] if current else None,
        "lastVerifiedAt": current.get("verifiedAt") if current else None,
        "lastAttempt": {key: last.get(key) for key in ("outcome", "targetCommit", "failedStep", "finishedAt") if key in last} if last else None,
        "serviceStates": states,
        "quadletImageRefs": quadlets,
        "runningImageRefs": running,
        "appliedMigrations": len(ledger),
        "migrationNames": ledger,
    }
    if target:
        result["targetPlan"] = build_plan(target, host, current).as_dict(host)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    status_parser = sub.add_parser("status")
    status_parser.add_argument("--release", type=Path)
    plan_parser = sub.add_parser("plan")
    plan_parser.add_argument("--release", type=Path, required=True)
    apply_parser = sub.add_parser("apply")
    apply_parser.add_argument("--release", type=Path, required=True)
    apply_parser.add_argument("--confirm", required=True, help="Full target commit SHA")
    args = parser.parse_args()
    host = Host()
    try:
        target = load(args.release) if getattr(args, "release", None) else None
        if args.action == "status":
            result = status(host, target)
        elif args.action == "plan":
            current = read_record(state_directory(host) / "current.json")
            result = build_plan(target, host, current).as_dict(host)
        else:
            result = apply_release(target, host, args.confirm)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, json.JSONDecodeError) as error:
        print(f"Maevelle staging {args.action} failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
