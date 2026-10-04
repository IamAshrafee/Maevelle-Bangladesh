# Current Focus

## Active Area

Customers Module — Production-Complete Customer Operations Workspace.

## Current Status / Substage

`CUSTOMERS_FRONTEND_WORKSPACE_COMPLETE`

## Implementation Overview

Successfully completed the dedicated **Frontend-Completion Phase for Maevelle's Customers module** (`BACKEND CAPABILITY → COMPLETE FRONTEND EXPERIENCE`). Maevelle's customer area is now a cohesive, operations-first customer workspace where staff can understand identity, manage contacts and addresses, audit commercial value and delivery/RTO risk, review duplicate candidates, execute safe guided merges, apply/lift commercial restrictions, inspect unified communication and business timelines, and bridge directly into manual sales order creation.

### 1. Operations-First Customer List (`apps/admin/components/customers/customers-list.tsx`)
- **Operational Queue Tabs**:
  - `All Customers`: Full customer directory with status badges and source tracking.
  - `Repeat Buyers`: Instant filter for high-value repeat shoppers (`minOrders >= 2`).
  - `High Spend`: Sorted by total lifetime spend (`sortBy = 'SPEND_DESC'`).
  - `Restricted & Blocked`: Triage queue for restricted or blocked customers (`status = 'BLOCKED'`).
  - `Recently Active`: Customers with recent purchase activity (`sortBy = 'RECENT_ORDER'`).
- **Flexible Bangladesh Search**: Matches full or partial BD phone numbers (`017...` and `+88017...`), emails, and human-facing customer numbers (`CUS-...`).
- **Responsive Layout**: Full tabular view for desktop with quick copy triggers; compact, touch-friendly card view for mobile/tablet preserving primary phone, tags, order count, spend, and restriction chips.
- **Server-Side Pagination & CSV Export**: Respects server filters, search queries, and page sizing without client-side data dumps.

### 2. Customer Detail Command Center (`customer-detail-console.tsx` & modular components)
- **Header & Canonical Resolution (`customer-header.tsx`)**:
  - Customer name, status badge, acquisition source badge, registration date.
  - Human-facing customer number with one-click copy feedback.
  - Prominent active commercial restriction indicators.
  - Merged Customer Banner: Detects canonical aliases and provides a clear link to the surviving customer record.
  - Actions bar: "Create Order", "Edit Profile", "Manage Tags", "Add Note", "Apply Restriction", "Merge Customer", "Anonymize".
- **Authoritative Metrics Strip (`customer-metrics-strip.tsx`)**:
  - Total Orders, Delivered Orders, Cancelled Orders.
  - Lifetime Order Spend (BDT), Collected Amount, Outstanding Amount, Average Order Value (AOV).
  - Latest order placement timestamp.
- **Contact Management (`customer-contact-section.tsx`)**:
  - Multi-phone & multi-email cards displaying normalized values, raw inputs, and primary badges.
  - Verification State: `Verified` badges with verification date/source, or `Unverified` chips with a staff verification workflow dialog.
  - Quick action controls: Copy, `tel:` / `mailto:` quick dial, "Set as Primary", and "Remove Contact" (with protection against deleting the sole primary contact).
- **Address Book (`customer-addresses-section.tsx`, `add-address-dialog.tsx`, `edit-address-dialog.tsx`)**:
  - Multi-address cards with Default shipping badges, formatted addresses (Line 1, Line 2, Area, City, District, Postal code), and copy buttons.
  - "Set as Default" inline trigger.
  - Order Snapshot Disclaimer: Explicitly informs operators that address book changes apply to future orders and do not mutate historical order snapshots.
- **Order, Return & Refund History (`customer-orders-section.tsx`)**:
  - Tabbed sub-navigation for Orders, Returns, and Refunds.
  - Orders tab: Order number, date, commercial status, delivery status, payment method, BDT total, and direct link to `/orders/[id]`.
  - Returns tab: Return Case number, order reference, return status, and items returned.
  - Refunds tab: Refund amount, payment method, settlement status, and reference.
  - Quick shortcut to "Create Order" with pre-selected customer profile.
- **Delivery Intelligence & Courier History (`customer-delivery-risk-card.tsx`)**:
  - Core delivery metrics: Successful deliveries, RTO count, failed attempts, eligible dispatches.
  - Courier Network Breakdown: Separate, explainable metrics for Internal history, Pathao, and Steadfast.
  - Explainable Risk Signals: Clear advisory messages explaining risk evaluation without opaque scores or judgmental labels.
  - Recent consignments list with tracking codes, delivery attempts, and outcomes.
- **Commercial Restrictions (`customer-restrictions-card.tsx`, `apply-restriction-dialog.tsx`, `lift-restriction-dialog.tsx`)**:
  - Active restrictions panel detailing restriction type (`COD_RESTRICTED`, `ORDER_REVIEW_REQUIRED`, `ORDERING_BLOCKED`), operational reason, issuer, and expiry.
  - Clear operational consequences preview (e.g. explains that COD restricted denies cash-on-delivery checkout).
  - Past restriction history log with lift reasons and operator attribution.
- **Duplicate Detection & Guided Safe Merge (`customer-duplicate-merge-dialog.tsx`)**:
  - Live duplicate candidate alert banner when duplicate candidates are detected.
  - 2-Step Guided Merge Workflow:
    - Step 1: Select target / master customer (either from detected candidates or live search).
    - Step 2: Live merge preview via `/admin/customers/:id/merge-preview` displaying side-by-side identity comparison, transferred resources impact (orders, contacts, addresses, tags), blocking conflicts, and warnings.
    - Explicit Keep vs Merge semantics: "Keep this Customer" vs "Merge duplicate into this Customer".
    - Mandatory reason and irreversible operation confirmation before execution.
- **Customer Anonymization (`anonymize-customer-dialog.tsx`)**:
  - Regulatory GDPR/privacy PII scrubbing requiring explicit customer code typing and reason code.
- **Future Customer Account Card (`customer-account-card.tsx`)**:
  - First-class support for guest customers as complete, legitimate customers.
  - Future-ready account linkage UI showing `No account linked` vs `Active linked account`.
  - Manual account linking / unlinking dialog for authorized staff.
- **Internal Staff Notes (`customer-notes-card.tsx`) & Tags (`customer-tags-card.tsx`)**:
  - Private operator notes with staff attribution and privacy disclaimer confirming notes are strictly admin-only and never exposed to customer-facing apps.
  - Custom tag assignment with color token rendering.
- **Unified Cross-Domain Timeline (`customer-timeline-section.tsx`)**:
  - Consolidates events across Commerce, Delivery, Communications, Restrictions, and Profile changes.
  - Category filters and load-more pagination.
- **Unified Email & SMS Communications (`customer-communication-section.tsx`)**:
  - Consolidated communication history from `/admin/customers/:id/communications`.
  - Channel filter (All, Email, SMS).
  - Safe message inspection modal displaying template code, recipient, delivery state, provider status, and sanitized message preview.

### 3. Integrated Manual Order Creation (`apps/admin/components/orders/create-manual-order-dialog.tsx`)
- Reads `?customerId=...` from query parameters when navigated from Customer Header or Orders section.
- Preselects the customer in the dropdown and fetches their full profile.
- Auto-populates delivery recipient name, phone, and default address while keeping the order snapshot completely editable.
- Prominently warns the operator if the selected customer has active commercial restrictions (e.g., COD Restricted or Blocked).

### 4. Verification & Integrity
- Clean TypeScript compilation across the entire workspace (`pnpm run typecheck` passed with 0 errors).
- Clean Next.js production build (`pnpm --filter @maevelle/admin build` compiled all 80 routes successfully).
- Obsolete MVP components (`customer-identity-actions.tsx`, `customer-email-communications.tsx`, `customer-sms-communications.tsx`) removed from the codebase.

## Verification Evidence
- Monorepo TypeScript check (`pnpm run typecheck`): Passed with 0 errors across all packages and apps.
- Next.js Production Build (`pnpm --filter @maevelle/admin build`): Compiled and generated all 80 static & dynamic routes with 0 errors.
- Dead Component Cleanup: Removed obsolete prototypes (`customer-identity-actions.tsx`, `customer-email-communications.tsx`, `customer-sms-communications.tsx`).
