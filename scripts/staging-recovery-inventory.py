#!/usr/bin/env python3
"""Print a read-only Maevelle staging recovery inventory; no host mutation."""

import json
import sys

sys.dont_write_bytecode = True

from recovery.inventory import collect


if __name__ == "__main__":
    try:
        print(json.dumps(collect(), indent=2, sort_keys=True))
    except Exception:
        # Never print raw subprocess stderr, database errors, secrets, or environment values.
        print("Maevelle staging inventory refused: identity or read-only probe failed.", file=sys.stderr)
        raise SystemExit(1) from None
