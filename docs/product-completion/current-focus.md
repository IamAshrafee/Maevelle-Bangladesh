# Current Focus

## Active area

Omnichannel messaging — Phase 07 Facebook Messenger Admin connection and
operations experience.

## Evidence state

`PHASE 06 BACKEND CODE COMPLETE / LIVE META ACTIVATION PENDING`

Commit `f257397` completes the repository-controlled Facebook Messenger backend:

- organization/member-bound OAuth state and authorized Page discovery;
- encrypted Page credentials, atomic reauthorization and global Page ownership;
- exact-body HMAC webhook verification with durable batched event intake;
- idempotent Page-scoped contact/conversation resolution into the canonical inbox;
- text, Unicode/Bangla, quick reply, postback, image, echo, delivery and read handling;
- server-authoritative 24-hour reply eligibility and worker revalidation;
- Send API text and reusable private-image delivery with conservative unknown outcomes;
- safe connection health, diagnostics, suspend/resume, disconnect and audit behavior; and
- resumable, bounded historical conversation/message synchronization.

The complete architecture, API catalog, security controls, activation steps,
limitations and Phase 07 handoff are recorded in
`docs/architecture/messaging/16-phase-06-completion.md`.

## Verification completed

- Rebuilt the disposable PostgreSQL volume and migrated development and test
  databases through the edited `3200_messaging_core` baseline.
- Repository TypeScript build and focused ESLint passed.
- Sixteen focused database/core/API/worker tests and the focused Meta configuration
  test passed.
- Secret scanning and `git diff --check` passed.
- A full Docker rebuild was attempted, but package installation timed out against
  the npm registry before compilation; it is not recorded as passed.
- The broad hardening script retains unrelated pre-existing Admin/chart findings;
  it did not report the new Facebook route.
- No live Meta credential, Page, approved recipient or public callback was
  available, so live webhook and customer-message behavior remains unverified.

## Next implementation boundary

- Build Phase 07's responsive Admin connection flow: availability, OAuth launch,
  callback result/Page selection, connection health, diagnostics, reauthorization,
  suspend/resume, disconnect and historical-sync progress.
- Keep Meta access tokens out of all browser contracts and preserve server-side
  authorization, reply eligibility and optimistic concurrency as authoritative.
- In parallel, the owner must prepare a Meta app and Page, current supported Graph
  version, business/domain verification where required, App Review/Advanced Access,
  public HTTPS webhook/OAuth callbacks and an approved test recipient.
- Do not claim deployment or live Messenger completion until those external gates
  and the activation checklist have been verified against current official Meta
  documentation.
