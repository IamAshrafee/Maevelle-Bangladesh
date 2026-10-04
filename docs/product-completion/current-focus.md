# Current Focus

## Active Area

Customers Module — Production-Complete Customer Identity & Relationship Domain.

## Current Status / Substage

`CUSTOMERS_PRODUCTION_DOMAIN_COMPLETE`

## Implementation Overview

Completed the dedicated deep completion pass for Maevelle's **Customers module**, transitioning from a basic commerce contact snapshot (`CUSTOMER AS BASIC COMMERCE RECORD`) into a production-complete customer identity and relationship domain (`CUSTOMER AS PRODUCTION-COMPLETE CUSTOMER IDENTITY & RELATIONSHIP DOMAIN`). Today's guest customer data can seamlessly become tomorrow's authenticated customer account history without losing, duplicating, or incorrectly merging historical records.

### 1. Contracts & API Alignment
- **List Orders Read Model**: Added `riskLevel?: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED' | null` to `OrderSummaryDto` in `@maevelle/contracts`.
- **Database & Query Projection**: Enhanced `packages/database/src/orders/queries.ts` to join and project `overall_risk_level as risk_level` from `orders.order_delivery_risk_evaluations`, and added `riskLevel` query filtering in `OrderListFilters`.
- **API Querystring Validation**: Added `riskLevel` to `/admin/orders` Fastify schema in `apps/api/src/routes/orders.ts`.

### 2. Operational Orders List & Workspaces (`apps/admin/components/orders/orders-list.tsx`)
- **6 Attention Queue Tabs**:
  - `All Orders`: Complete catalog with full filtering and pagination.
  - `Needs Review`: Captures `SUBMITTED` or `AWAITING_PAYMENT` orders needing merchant attention.
  - `To Fulfill`: Displays `CONFIRMED` orders ready for inventory allocation and packing.
  - `In Delivery`: Tracks active consignments (`DISPATCHED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`).
  - `Delivery Issues`: Immediate triage for `FAILED_ATTEMPT`, `ON_HOLD`, or `RTO` orders.
  - `Completed`: Archive view for `DELIVERED` orders.
- **Delivery Risk Indicators**: Server-evaluated risk badges (`Elevated Risk`, `Moderate Risk`, `Low Risk`, `No History`) right on the order rows for immediate scanability.
- **Responsive Views**: Full tabular desktop view with copyable phone and order numbers; clean mobile card layout preserving status, payment, fulfillment, and risk chips.
- **Advanced Filtering & Server Pagination**: Order status, payment status, fulfillment status, delivery status, risk level, sales channel, payment method, order tags, and date ranges.

### 3. Order Command Center (`order-detail-console.tsx` & modular cards)
- **Status Strip (`order-summary-strip.tsx`)**: 4-dimension operational status (Commercial, Payment & COD, Fulfillment progress, Logistics & Courier state).
- **Delivery Intelligence & Steadfast Fraud Risk Card (`order-risk-card.tsx`)**:
  - Steadfast courier network check metrics (total deliveries, success rate, returns/RTO count).
  - Internal store history (previous completed orders, return rate).
  - 48-hour duplicate order candidate warnings with direct order links.
  - Human-explainable advisory signals (e.g. "Elevated RTO rate in courier network", "First time COD buyer").
  - On-demand refresh action hitting `POST /admin/orders/:orderId/risk-assessment/refresh`.
- **Customer Verification Workflow (`order-verifications-card.tsx` & `record-verification-dialog.tsx`)**:
  - Log verification events with channels (`PHONE_CALL`, `WHATSAPP`, `SMS`, `MANUAL_REVIEW`, `FRAUD_ANALYSIS`) and structured outcomes (`CONFIRMED`, `UNREACHABLE`, `ADDRESS_UPDATED`, `SUSPICIOUS_CANCEL_RECOMMENDED`, `OTHER`).
  - Displays verification timeline entries with operator attribution and notes.
- **Unified Business Timeline (`order-timeline-card.tsx`)**:
  - Real event categories (`ORDER`, `PAYMENT`, `FULFILLMENT`, `DELIVERY`, `RETURN`, `VERIFICATION`, `NOTE`).
  - Color-coded icons, relative time formatting, and actor badges (`Customer`, `Admin`, `System`, `Courier`).
- **Items & Fulfillment Allocation (`order-items-card.tsx`)**:
  - Immutable item snapshots (SKU, title, variant option badges, snapshot unit price, discounts).
  - Fulfilled vs remaining fulfillable quantities displayed per line.
  - Distinct `Customer Shipping Charge` vs logistics `Courier Cost`.
- **Financial Summary & COD Collection (`order-payment-card.tsx`)**:
  - Clear breakdown: Total, Amount Paid, COD Collectible, Outstanding.
  - Highlights cancellation refund obligations when applicable.
- **Fulfillment & Logistics (`order-fulfillment-delivery-card.tsx`)**:
  - Fulfillment allocations with packing status and shipment links.
  - Courier delivery status, tracking code, consignment references, delivery attempts, and prominent Courier RTO alerts.
- **Customer Returns & Refunds (`order-returns-refunds-card.tsx`)**:
  - Strictly separated from courier RTO. Shows RMA cases, return items, inspected conditions, and monetary refunds.
- **Customer & Pre-Fulfillment Address (`order-customer-address-card.tsx`)**:
  - Customer contact details, repeat buyer summary, one-click phone copy.
  - Pre-fulfillment address editor modal with division, city, zone, and delivery instructions.
- **State-Aware Actions (`order-header-actions.tsx`)**:
  - `confirm-order-dialog.tsx`: Advisory warning when confirming orders with elevated delivery risk.
  - `cancel-order-dialog.tsx`: Reason attribution (`CUSTOMER`, `MERCHANT`, `SYSTEM`), operational consequence summary (inventory release, refund required).
  - Contextual hold, resume, complete, and fulfillment triggers based on server-provided `capabilities`.

## Verification Evidence
- Monorepo TypeScript check (`pnpm run typecheck`): Passed with 0 errors.
- Database test suite (`pnpm --filter @maevelle/database test`): All tests passing.
- Next.js Production Build (`pnpm --filter @maevelle/admin build`): Compiled and generated all 80 static & dynamic routes with 0 errors.
