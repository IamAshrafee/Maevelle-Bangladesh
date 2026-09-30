# Current Focus

## Active Areas

Delivery & Fulfillment Operations: Delivery Console (`/delivery`), Fulfillment, Pathao & Steadfast Connected Courier Providers, Customer Delivery Intelligence

## Current Status / Substage

`DELIVERY_COMPLETE / READY_FOR_OWNER_REVIEW`

## Evidence Already Known

Delivery / Fulfillment has been completed as a production-grade, multi-courier fulfillment platform:
- Pathao Courier integrated as primary connected provider: AES-256-GCM encrypted credentials, automated OAuth 2.0 token management with concurrent refresh locks, Store sync and pickup mapping, price quoting, consignment booking with automatic address detection, cancellation support, multi-event tracking timelines, and webhook ingestion with signature verification and required response header.
- Customer Delivery Intelligence & Delivery Risk: Factual first-party cross-courier performance analysis queryable by Customer ID, Order ID, Delivery ID, or normalized Bangladesh phone (`+8801...`, `01...`). Generates explainable, non-accusatory risk levels (`INSUFFICIENT_HISTORY`, `LOW`, `MODERATE`, `ELEVATED`) with explicit reasons (e.g. repeated RTO, recent negative trends, courier exceptions).
- Surfaced across Order Detail, Customer Detail, and Delivery Console for operator review before fulfillment.
- Inbound courier webhooks automatically trigger Return-to-Origin (RTO) cases and reverse transport state transitions.
- Background worker processes bookings, cancellations, and reconciliation safely without duplicate consignments or unsafe retries.

## Immediate Objective

Conduct owner visual and operational review of Delivery Console, Order Detail delivery risk indicators, and Pathao integration settings.

## Last Completed Action

Integrated Pathao Courier provider adapter, multi-event tracking, booking cancellation, webhook responses, customer delivery intelligence across couriers, and admin order detail delivery risk displays. Passed focused vitest suites and full TypeScript compilation.

## Important Constraints

- Authoritative state transitions remain inside Maevelle's delivery state machine.
- Courier tracking and COD observations are operational evidence, separated from finance and ledger truth.
- Delivery risk scores are explainable decision aids; orders are never silently cancelled based solely on automated risk scores.

## Blockers / Owner Review

No code blockers. Ready for owner visual and operational review.
