#!/usr/bin/env python3
"""Operator-only Maevelle staging backup lifecycle commands."""

import argparse
import json
import sys

sys.dont_write_bytecode = True

from recovery.capture import capture, plan
from recovery.inventory import collect
from recovery.operations import inspect_set, transfer_verify
from recovery.retention import execute_retention, retention_plan
from recovery.safety import load_configuration


def main() -> None:
    parser = argparse.ArgumentParser(description="Maevelle staging recovery; no automatic schedule or reset")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("inventory", help="read-only Phase 04.1 host inventory")
    commands.add_parser("status", help="read-only host inventory")
    capture_plan = commands.add_parser("plan", help="read-only current capture plan")
    capture_plan.add_argument("--kind", choices=("database-only", "coordinated"), required=True)
    for name in ("checkpoint", "capture"):
        operation = commands.add_parser(name, help="operator-confirmed encrypted capture")
        operation.add_argument("--confirm", required=True, help="exact current planId")
    inspection = commands.add_parser("inspect", help="verify local artifact sizes and SHA-256")
    inspection.add_argument("--id", required=True)
    transfer = commands.add_parser("transfer-verify", help="upload and read back immutable off-host artifacts")
    transfer.add_argument("--id", required=True)
    transfer.add_argument("--confirm", required=True, help="exact recovery-set ID")
    commands.add_parser("retention-plan", help="read-only review of proposed deletions")
    retention = commands.add_parser("retention-execute", help="delete only approved exact recovery sets")
    retention.add_argument("--confirm", required=True, help="exact current retention planId")
    args = parser.parse_args()
    try:
        if args.command in ("inventory", "status"):
            result = collect()
        elif args.command == "plan":
            snapshot = collect()
            result = plan(snapshot, load_configuration(snapshot), args.kind)
        elif args.command in ("checkpoint", "capture"):
            result = capture("database-only" if args.command == "checkpoint" else "coordinated", args.confirm, collect)
        elif args.command == "inspect":
            result = inspect_set(args.id)
        elif args.command == "transfer-verify":
            result = transfer_verify(args.id, args.confirm, collect)
        elif args.command == "retention-plan":
            snapshot = collect()
            result = retention_plan(load_configuration(snapshot))
        else:
            result = execute_retention(args.confirm, collect)
        print(json.dumps(result, indent=2, sort_keys=True))
    except Exception:
        # Never emit subprocess stderr, SQL errors, configuration data, or paths.
        print("Maevelle staging recovery refused or failed; inspect scoped service status and private operator diagnostics.", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
