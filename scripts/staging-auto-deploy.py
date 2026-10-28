#!/usr/bin/env python3
"""Check the newest completed main release and apply only when safe."""

import argparse
import json
import sys

sys.dont_write_bytecode = True

from staging.auto import check


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "preflight"))
    args = parser.parse_args()
    try:
        result = check(dry_run=args.action == "preflight")
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, RuntimeError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"Maevelle auto-deploy: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
