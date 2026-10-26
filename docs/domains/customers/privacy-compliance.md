# Customer CRM privacy and platform compliance

**Reviewed:** 2026-10-25  
**Scope:** Customer 360, identity links, consent, privacy work, exports, and Meta-originated customer data.  
**Status:** Engineering control map, not legal advice. Maevelle must obtain Bangladeshi counsel before production activation and recheck implementing rules.

## Current Bangladesh baseline

The current primary authority is the [Personal Data Protection Act, 2026 (Act 63 of 2026)](https://bdlaws.minlaw.gov.bd/act-details-1692.html?lang=en), enacted 10 April 2026. It repealed the 2025 ordinance. Most provisions are deemed effective from 6 November 2025; the Act states that sections 23 and 31–35 require a later Gazette commencement after the stated 18-month interval. Operations must not treat rules or regulator procedures that have not been published as settled.

The implemented control map is:

| Obligation | CRM control | Remaining operational obligation |
| --- | --- | --- |
| Lawful, specific and withdrawable processing basis (section 5) | Append-only purpose/channel consent records retain basis, source, evidence, effective time and withdrawals/suppression. Segment membership never grants messaging eligibility. | Publish purpose-specific notices; counsel must approve the basis used for each processing purpose. |
| Access and portability (section 11) | Restricted privacy-request worklist, controlled audited directory CSV, and an audited JSON data-subject bundle gated by both privacy and export capabilities plus an in-progress access/export request. The bundle excludes internal notes, risk signals, provider payloads, internal messages and platform audit internals. | Verify requester identity, perform human disclosure review, redact third-party data where required, and deliver through an approved secure channel. |
| Correction (section 12) | Optimistic-concurrency profile/contact updates, provenance, audit, and a CORRECTION request type. | Notify required recipients and document any refusal under the procedure then in force. |
| Withdrawal, objection and deletion (section 13) | Consent withdrawal/suppression states, restriction and anonymization request types, existing guarded anonymization that preserves mandatory commercial history. | Determine legal retention per record class. Do not close an anonymization request merely because the work item exists. |
| Purpose limitation/confidentiality (section 16) | Tenant-qualified foreign keys, capability authorization, masking, no broad realtime payload containing the full customer record. | Maintain and publish the processing-purpose register. |
| Proportionate security (section 17) | Server-enforced capabilities, audit, scoped identity evidence, concurrency constraints, encrypted provider credentials in the messaging domain, and no secrets in exports. | Complete production security review, key-management review, access recertification and incident exercises. |
| Retention and processing records (sections 18–19) | Provenance, consent history, identity-link history, immutable notes/revisions, privacy work records and audit events. | Configure a counsel-approved retention schedule; regulations may define periods beyond the Act's baseline recordkeeping requirement. |
| Breach response (section 20) | Existing audit/integrity foundation supports investigation evidence; this CRM does not silently repair ambiguous identity incidents. | Add the production incident runbook, regulator/contact roster and notification decision log before launch. |

The [official rights chapter](https://bdlaws.minlaw.gov.bd/act-1692/act-chapter-print-2695.html) requires identity/risk verification for rights requests, access in a concise intelligible form, correction, withdrawal/objection, and qualified deletion. The [official security and breach chapter](https://bdlaws.minlaw.gov.bd/act-1692/act-chapter-print-2696.html) requires accountable, transparent processing, proportionate technical and organizational safeguards, retention controls, records, and breach notice where significant harm is likely.

## Identity safeguards

- Names, photographs, geography, interests, message wording and unverified contact values never establish an active cross-channel link.
- Provider identifiers are scoped by organization and channel connection; equal strings in different scopes are unrelated.
- Staff review is capped at LOW assurance. HIGH assurance is reserved for authenticated-account or verified contact evidence.
- Candidates do not expose customer history. Only an active trusted link enables inbox commerce context.
- Link, rejection, conflict and revocation events remain auditable. Revocation preserves provider conversations.
- Customer merges preserve aliases and immutable domain histories; merge reversal is not represented as generally safe.

## Meta-originated data

Phase 11 does not broaden provider sending, scrape profiles, or create a second provider integration. It reuses the policy-enforced Facebook and Instagram adapters documented in [messaging architecture](../../architecture/messaging/06-meta-integrations.md) and the current [Phase 10 audit](../../architecture/messaging/phase-10/audit.md). Those adapters enforce recipient initiation, scoped Page/Instagram identifiers, the ordinary 24-hour reply window, connection permissions, and provider-side delivery checks independently of CRM consent or segment membership.

Current official references to reconfirm in Meta Dashboard before activation:

- [Meta Messenger Platform official collection](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api)
- [Meta Instagram API official collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Meta Platform Terms](https://developers.facebook.com/terms/)
- [Meta Developer Policies](https://developers.facebook.com/devpolicy/)

The official developer pages rate-limited automated review on 2026-10-25. Therefore live app review status, approved scopes, webhook subscriptions, deletion callback, current Graph version, token lifecycle and real-asset behavior remain an owner-run production gate. CRM identity linking does not satisfy or bypass any provider messaging permission.

## Known limitations

- The data-subject JSON bundle is implemented, but automated third-party redaction and a secure customer delivery channel are not. Human disclosure review remains mandatory.
- Privacy requests are tracked and audited, but no request status automatically deletes or alters business data.
- No production retention schedule is enabled because the applicable regulations and Maevelle legal/accounting requirements must be confirmed first.
- No live Meta credentials or customer identities were used in validation.

