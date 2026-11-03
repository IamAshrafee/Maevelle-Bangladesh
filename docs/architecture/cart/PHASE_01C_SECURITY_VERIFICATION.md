# Phase 01-C security verification

Reviewed TypeScript boundaries using the repository SAST workflow and executed the real PostgreSQL and Fastify adversarial suites. Semgrep was unavailable locally.

| Threat IDs | Fresh coverage |
| --- | --- |
| T01/T02/T04/T15/T30 | Scoped cookie/context/line/tenant/currency, retired/forged credentials, A/B sign-in, mapping and expiry, Checkout guest-substitution denial. New C05 PATCH/DELETE tests use another guest's real line. |
| T03/T14/T19 | Origin/Fetch Metadata, JSON/schema, spoofed forwarding and cross-instance rate-limit evidence. Ingress IP policy remains unverified. |
| T05/T16/T21 | Secure/host-only attributes in API suite, Chrome HttpOnly and cookie denial, no-store/public HTML isolation, minimal hints/journal and API log canary. Real ingress logs/cache remain unverified. |
| T06–T09/T13 | Unpublished redaction, supplied price/tenant/currency rejection, bounded Promotion stacks, negative/fractional/overflow quantity, invalid coupon/UUID and oversized inputs, parameterized SQL review. |
| T10/T11/T20 | Concurrent replay, changed fingerprint, stale revision, receipt expiry, rollback and connection loss, coupon/Clear race, worker regression. Future Cart projectors are outside this proof. |
| T12/T17–T18/T22–T29 | Limited static review and existing Wishlist regressions. Transfer, analytics, broader XSS corpus, supply chain, retention and persistent restore revocation remain separate gates. |

| Finding | Severity | Root cause and closure |
| --- | --- | --- |
| C01-F01 recovery read ignored backoff | Medium reliability | Pending issue masked the new Retry-After deadline. Accept the later deadline and preserve existing recovery policy and exact intent. Red/green controller and C01 browser cases. |
| C01-F02 malformed JSON returned 503 | Low | Assembled parser emitted an unclassified error. Classify as 400, preserving safe Cart envelope and excluding retry/cookie issuance. Reproduced through HTTP and assembled API regression. |
| C01-F03 coupon code in API logs | Medium | Fastify logged the literal DELETE coupon path before the Cart error handler. Suppress raw request logging in the Cart namespace and record route template, method, status and elapsed time. Canary checks both coupon and cookie absence. [Fastify logging configuration](https://fastify.dev/docs/v5.12.x/Reference/Server/#logcontroller). |

No unresolved Critical or High defect was demonstrated in the exercised foundation. Actual TLS proxy/caching, access logs, roles, business policy and representative abuse/load require separate evidence.
