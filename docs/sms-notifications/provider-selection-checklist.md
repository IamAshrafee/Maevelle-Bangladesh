# SMS Provider Selection & Integration Checklist

Do not select a provider from this document alone. Record evidence from current official provider documentation, a commercial quote, and a controlled technical trial.

## Business

- Per-segment price for masking, non-masking, Bangla/Unicode, and taxes
- Minimum recharge, credit expiry, refunds, invoicing, and contract term
- Bangladesh A2P registration, business documents, sender approval, and lead time
- Support hours, escalation route, service commitments, and outage communication

## API and delivery

- HTTPS REST API, authentication scheme, JSON contracts, official docs, sandbox
- Provider message ID and stable idempotency support
- Synchronous acceptance semantics and documented timeout behavior
- Signed delivery callbacks, replay identity, delayed state, status lookup, retention
- Rate limits, sustained/burst throughput, batch transport, retry guidance

## SMS behavior

- Bangla/Unicode fidelity and documented segment/billing calculation
- GSM-7 extension behavior and maximum message length
- Masking and non-masking sender support and approval verification
- Carrier coverage, DND/block behavior, rejection reason quality

## Operations and security

- Balance/cost API, provider-reported segments, dashboard/export/reconciliation
- Webhook signing or token scheme, raw-body requirements, IP ranges, rotation
- Credential scopes, multiple environments, audit logs, data retention, sub-processors
- Bangladesh privacy/compliance posture and callback payload minimization

## Trial exit criteria

- Contract tests pass, including Unicode and idempotency behavior
- Controlled sends reach multiple Bangladesh networks
- Accepted and delivered are distinguishable
- Duplicate and out-of-order callbacks do not regress Maevelle state
- Timeout/unknown outcome can be reconciled without duplicate sends
- Provider support can trace a message using the stored provider ID
