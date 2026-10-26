# Phase 11 Customer 360 and Unified Identity

**Status:** implementation architecture  
**Authority:** current source, migrations, and Product Completion V2 evidence  
**Domain owner:** `customers`

## Discovery map

Maevelle already has a canonical, organization-scoped customer record in
`customers.customers`. Checkout and manual orders use the same conservative
resolution service, orders retain immutable customer/address snapshots, and
customer aliases preserve commerce history after merges. This remains the
customer source of truth.

The existing customer domain already provides multiple phones, emails and
addresses, contact verification metadata, customer accounts, restrictions,
tags, notes, duplicate candidates, merge preview/execution, anonymization,
commerce summaries, communications and a cross-domain timeline. These
capabilities are extended rather than duplicated.

Messaging remains authoritative for channel connections, contacts, scoped
Facebook/Instagram/website identities, conversations, provider policy and
message delivery. CRM owns the relationship between a canonical customer and
those identities. A channel identifier is unique only inside its organization
and channel-connection scope.

Orders, payments, fulfillment, delivery, returns and reviews remain
authoritative for their records. CRM queries or projects bounded summaries and
references; it does not copy mutable financial or message payloads.

## Missing capabilities addressed by Phase 11

- profile structure, provenance, completeness, lifecycle and relationship owner;
- typed organization-defined attributes and structured preferences;
- assurance-aware identity links, candidate/rejected/conflict states, revocation
  history and concurrency-safe uniqueness;
- durable merge command identity and richer merge provenance;
- pinned/versioned internal notes;
- lifecycle history, follow-ups and ownership history;
- static and validated dynamic segments with bounded member evaluation;
- saved customer directory views and audited bounded bulk operations;
- consent/suppression history and privacy request/export workflows;
- dedicated capability boundaries for sensitive contact data, identity,
  segments, exports, privacy and CRM settings;
- directory/profile filters and CRM workspaces for identity, duplicates,
  segments, analytics and settings.

## Authoritative relationships

```text
customers.customers (canonical person/customer)
  |-- customer_phones / customer_emails / customer_accounts
  |-- customer_identity_links -- messaging.contact_identities
  |-- customer_preferences / customer_custom_field_values
  |-- customer_lifecycle_history / customer_ownership_history
  |-- customer_follow_ups / customer_notes (+ revisions)
  |-- customer_tag_assignments / customer_segment_memberships
  |-- customer_consents / customer_privacy_requests
  `-- customer_aliases --> merged historical customer

orders/payments/delivery/returns/reviews -- reference customer or alias
messaging.conversations -- reference messaging contact/identity
```

## Identity assurance and linking rules

Identity links use explicit statuses (`CANDIDATE`, `LINKED`, `REJECTED`,
`REVOKED`, `DISPUTED`) and assurance (`UNVERIFIED`, `LOW`, `MEDIUM`, `HIGH`).
Only active `LINKED` rows provide customer context. Manual staff review is
recorded as evidence but never mislabeled as technical ownership proof.

Automatic linking is restricted to deterministic evidence already controlled
by Maevelle, such as the same authenticated customer account or a verified
contact method with no conflict. Names, avatars, geography, interests,
unverified contact values and model-generated guesses may only create review
candidates. A partial unique constraint prevents one active scoped channel
identity from linking to multiple customers; link commands lock the source
identity and affected customers in one transaction.

Revocation never deletes a contact, identity, conversation or message. It closes
the CRM link, updates messaging's current contact projection, and writes both
identity history and the platform audit log.

## Merge policy

The target survives as canonical. Immutable financial, order, delivery and
conversation history is retained against its original record and resolved
through aliases. Mutable CRM-owned records can be reconciled in the merge
transaction. Conflicting accounts or active identity links block execution.
Consent and suppression resolve to the most restrictive effective state.

Merge commands require an idempotency key and expected source/target versions.
The command claim, merge record, alias, mutable CRM reconciliation, audit and
outbox event commit atomically. Full automatic reversal is not promised because
subsequent writes may depend on the canonical identity; recovery uses the merge
snapshot and an explicitly audited incident workflow.

## API and authorization boundaries

All APIs derive organization and actor context from the authenticated
membership. Client-supplied organization identifiers are ignored. Collection
APIs are bounded and paginated; mutation bodies are runtime validated; state
changes use predictable error codes and audit events.

Capabilities are separated into customer view/manage, sensitive-contact view,
identity management, merge, relationship management, segment management,
export, privacy and CRM settings. UI visibility mirrors but does not replace
server enforcement.

## Read models and performance

The customer directory uses indexed organization/status/lifecycle/owner/activity
paths and bounded search. Timeline entries are a union of authoritative domain
facts and audit/outbox references; message bodies and financial internals are
not duplicated. Segment definitions use a closed JSON rule grammar compiled to
parameterized SQL—never user SQL—and member reads are paginated. Current Phase
11 exports and dynamic-segment evaluations are bounded synchronous operations.
They do not yet dispatch durable background jobs; representative-volume proof
is therefore required before their limits are increased.

## Migration and deployment

During current disposable-data heavy development, the customer baseline is
extended in place and the messaging baseline adds the CRM foreign key only after
messaging identities exist. A fresh database remains the primary migration
proof. Before a persistent environment is introduced, freeze the baseline and
translate these changes into expand-and-contract forward migrations with a
batched, idempotent reconciliation job for existing contacts and customers.

No new infrastructure or paid service is required. PostgreSQL, the modular
monolith, audit/outbox and existing realtime stream remain authoritative.
