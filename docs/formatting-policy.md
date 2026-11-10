# Formatting policy during deliberate debt reduction

Use the existing Prettier3.9.6 configuration and EditorConfig defaults: UTF-8/LF, two-space indentation, final newline, single quotes, trailing commas and100-column print width. `.gitattributes` governs checkout normalization. Configuration and ignore files were not changed by09A.5.

Two commands answer different questions:

- `pnpm format:check` checks the full existing Prettier scope. It currently **fails** on inherited debt. Never describe a passing regression check as full formatting PASS.
- `pnpm format:check:regressions` checks tracked and untracked format-supported files using the same ignore/configuration. Unchanged debt recorded in `tooling/format-debt-baseline.json` is recognized; a new or modified unformatted file fails. Fixing a debt file passes. Historical migration content and the accepted hash manifest are additionally protected even if formatting would pass or the file were removed/ignored.

The debt fingerprint normalizes CRLF to LF for Windows/Linux checkout portability and hashes every other character with SHA-256. It does not normalize SQL spacing, numeric strings, identifiers or content. Raw before/after hashes remain separate evidence for a formatting batch. The policy also fingerprints formatter configuration; a configuration change fails closed until explicitly reviewed with its baseline impact.

There is no automatic baseline-refresh or bypass flag. Reducing debt is welcome: preview a focused diff, check ownership/current bytes, preserve meaningful literals, apply the reviewed files, run focused verification and remove resolved baseline entries in the same reviewed change. Adding exceptions, changing configuration or rebaselining requires an explicit impact review; it is not an ordinary way to make CI green. The baseline itself is version-controlled review material, not a change to Prettier's ignore rules.

For ordinary work, format only the files or selected code you actually change, then run `pnpm lint` and `pnpm format:check:regressions`. If touching a large inherited file would cause a broad unrelated rewrite, first prepare a separate mechanical proposal or keep the change pending with its owner; do not silently refresh its exception hash. Never run a mass Prettier write over other contributors' dirty work. Do not format historical migrations or signature/byte-exact fixtures merely to reduce counts.

`pnpm test:format-policy` tests new/changed-debt rejection, debt resolution, protected content and significant-string/template/JSX differences. `scripts/format-safety.mjs` is a conservative preview aid comparing emitted syntax and raw template chunks; it is not a proof of every runtime behavior. A rejected proposal needs review, not a weaker comparison to force acceptance.

CircleCI's existing nonpublishing validation runner now executes the formatting regression gate, full ESLint with zero warnings, policy tests and the current83-file commerce selection before publishing can proceed. The full formatter still has a separate reported FAIL. No pre-commit hook was installed, no external CI job was triggered and no publication/deployment is authorized by this policy.
