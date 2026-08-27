# Verification Policy

An area passes only with relevant proof across business purpose, lifecycle,
schema/invariants, commands, queries, API validation, authorization and tenant
isolation, Admin/Storefront UX, cross-domain effects, failure recovery,
accessibility, responsiveness, performance, tests, and a realistic workflow.

Use focused tests while implementing, broader regressions near checkpoints, and
the root validation commands near area closure. Local checks prove only the
environment and behavior actually exercised. External staging, providers,
backup infrastructure, production data, and owner acceptance are separate gates.

Area verification documents must list exact commands and manual workflows.
Passing unit tests alone never grants `VERIFIED_COMPLETE`.
