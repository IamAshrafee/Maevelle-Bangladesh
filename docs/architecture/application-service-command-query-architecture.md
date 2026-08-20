# Maevelle Ecommerce — Application Services, Commands & Queries Architecture

**Document:** `docs/architecture/application-service-command-query-architecture.md`
**Status:** Implementation Contract / Living Document
**Version:** 0.1
**Related:** Domain Architecture, PostgreSQL Schema Specification, API/Webhook Architecture, Security Architecture

---

# 1. Purpose

This document defines the layer between:

```text
HTTP / Storefront / Admin / Worker / Integration
                    │
                    ▼
          APPLICATION SERVICES
                    │
              ┌─────┴─────┐
              ▼           ▼
           COMMANDS      QUERIES
              │           │
              ▼           ▼
            DOMAIN    READ MODELS
              │
              ▼
          PostgreSQL
```

It establishes exactly how application code is allowed to operate Maevelle.

The primary objective is:

> **Business workflows must exist once, in explicit application commands, rather than being recreated independently in controllers, background jobs, scripts, or integrations.**

---

# 2. Core Rule

Every business interaction belongs to one of two categories:

```text
COMMAND
    Changes business state.

QUERY
    Reads business state without changing it.
```

Examples:

```text
PlaceOrder
→ Command

GetOrderWorkspace
→ Query
```

The separation is architectural rather than infrastructure-heavy. Commands and queries can live in the same modular monolith and use the same PostgreSQL database.

---

# 3. What We Are NOT Building

Maevelle is **not** adopting:

```text
separate command database

separate query database

event sourcing

Kafka-based CQRS

microservices per command

a mandatory mediator framework
```

V1 uses:

```text
simplified CQRS
+
modular monolith
+
PostgreSQL
```

---

# 4. Application Layer Responsibility

The Application Layer coordinates a use case.

It may:

```text
authenticate actor context

authorize capability/scope

load domain entities

open transaction

obtain locks

invoke domain behavior

coordinate multiple modules

persist resulting state

write Outbox events

write Audit

return application result
```

It should not contain the underlying commercial rules that belong inside the domain model.

Microsoft's DDD guidance makes the same separation: the application layer coordinates work while the domain model remains independent of infrastructure/ORM concerns.

---

# 5. Domain Layer Responsibility

Domain owns questions such as:

```text
Can this Order be cancelled?

Can this quantity be fulfilled?

Is this Promotion applicable?

Can this Receipt be posted?

How much Inventory is available?

Is this Refund amount valid?

Can this Customer merge proceed?
```

Application Service owns:

```text
Who requested it?

Do they have permission?

Which records need loading?

Which transaction is required?

Which module must be called?

Which events are emitted?

What gets audited?
```

---

# 6. Transport Must Stay Thin

HTTP Controller:

```text
Request
  ↓
Parse + validate transport
  ↓
Build Command
  ↓
Command Bus / Application Service
  ↓
Map Result
  ↓
HTTP Response
```

Forbidden:

```text
Controller
  ↓
Query database
  ↓
Update Inventory
  ↓
Create Order
  ↓
Send email
```

---

# 7. Workers Follow Same Rule

Background worker:

```text
Job
 ↓
Application Command
 ↓
Domain
```

not:

```text
Job
 ↓
direct UPDATE
```

---

# 8. Integration Callbacks Follow Same Rule

Example:

```text
SSLCommerz Callback
       ↓
Provider Adapter
       ↓
Normalized Provider Event
       ↓
ReconcileProviderPayment Command
       ↓
Payment Domain
```

---

# 9. Repair Operations Follow Same Rule

Even repair tooling uses semantic commands:

```text
RebuildInventoryLevel

ResolvePaymentReconciliation

ResolveReceivingException

RelinkExternalDelivery
```

Never:

```text
PATCH arbitrary row
```

---

# 10. Command Characteristics

Every Command must have:

```text
Command Name

Actor Context

Organization

Input

Permission

Scope requirements

Idempotency policy

Transaction policy

Concurrency strategy

Domain ownership

Cross-domain dependencies

Result

Errors

Events

Audit behavior
```

---

# 11. Command Naming

Use verbs describing business intent.

Good:

```text
CancelOrder

VerifyPayment

PostInboundReceipt

AdjustInventory

FinalizeLandedCost
```

Bad:

```text
UpdateOrderStatus

SetPaymentStatus

UpdateInventoryRow
```

---

# 12. Command Input

Commands accept only what the caller is legitimately allowed to decide.

Example:

```text
VerifyPayment
```

caller may submit:

```text
Payment Attempt ID

Verified Amount

Provider Reference

Verification Note
```

caller does **not** submit:

```text
payment.status = CONFIRMED

order.is_paid = true
```

Those are results of domain behavior.

---

# 13. Command Immutability

Treat Command input as immutable once created.

Example concept:

```ts
type CancelOrderCommand = {
  organizationId: UUID;
  orderId: UUID;
  reasonCode: string;
  note?: string;
  expectedVersion?: number;
};
```

Handlers do not mutate command payload to track workflow state.

---

# 14. Command Context

Transport-independent metadata should be carried separately as:

```text
ApplicationContext
```

Conceptually:

```text
organizationId

principalType

principalId

membershipId

requestId

correlationId

idempotencyKey

source

authenticationLevel
```

---

# 15. Source

Potential sources:

```text
ADMIN

STOREFRONT

API

WORKER

PROVIDER_CALLBACK

SYSTEM

IMPORT
```

---

# 16. Actor

Potential actor types:

```text
MEMBERSHIP

CUSTOMER

SERVICE_ACCOUNT

SYSTEM

EXTERNAL_PROVIDER
```

---

# 17. Authorization Happens Before Mutation

Pipeline:

```text
Command
   ↓
Identity
   ↓
Organization
   ↓
Capability
   ↓
Scope
   ↓
Resource-level policy
   ↓
Execute
```

---

# 18. Domain Still Validates

Even authorized actor cannot perform impossible state transition.

Example:

```text
payments.refund permission
```

does not allow:

```text
Refund ৳5,000
against ৳1,000 refundable value.
```

---

# 19. Command Pipeline

Recommended logical pipeline:

```text
1. Request Context

2. Transport Validation

3. Authentication

4. Authorization

5. Rate / Abuse Check where required

6. Idempotency Registration

7. Application Validation

8. Transaction

9. Domain Execution

10. Persistence

11. Outbox

12. Audit

13. Commit

14. Result

15. Async side effects
```

Not every internal SYSTEM command needs every stage.

---

# 20. Transaction Boundary Rule

> **The Command Handler/Application Service owns the transaction boundary for its use case.**

Repositories do not independently commit.

---

# 21. Example — Place Order

```text
PlaceOrder
   │
   ▼
BEGIN
   │
   ├── Checkout validation
   ├── Pricing validation
   ├── Promotion claim
   ├── Customer resolution
   ├── Order creation
   ├── Inventory reservation
   ├── Payment Intent
   └── Outbox
   │
COMMIT
```

---

# 22. External Calls

External HTTP calls should normally occur:

```text
after local transaction
```

through:

```text
Outbox / Job / Integration Operation
```

rather than holding database locks while waiting for a provider.

---

# 23. Query Characteristics

Queries:

```text
do not mutate business state

do not generate domain events

do not require domain aggregate reconstruction merely to display data

may join multiple domains

may read projections

may use optimized SQL

return purpose-built DTOs
```

Simplified CQRS specifically permits query-side reads to use models optimized for presentation rather than forcing queries through write-domain aggregates.

---

# 24. Query Naming

Good:

```text
GetOrderWorkspace

ListInventoryByLocation

SearchCatalog

GetCustomer360

GetPaymentReconciliation
```

Bad:

```text
GetOrderEntity

GetAllRows
```

---

# 25. Query DTOs

Purpose-built:

```text
OrderListItem

OrderWorkspace

ProductEditorView

InventoryItemDetail

Customer360

ReceivingWorkspace

FinanceDashboard
```

not:

```text
raw ORM entity.
```

---

# 26. Queries May Cross Domains

Example:

```text
GetOrderWorkspace
```

can read:

```text
Order

Customer

Payment Summary

Fulfillment Summary

Reservation Summary

Audit/Timeline

Delivery context
```

without requiring one giant Order aggregate.

---

# 27. Query Authorization

Queries still require:

```text
organization

capability

scope

sensitive-field authorization
```

---

# 28. Command Ownership

Every command has exactly one **owning application module**.

Example:

```text
CancelOrder
→ Orders Application Module
```

Even though it may coordinate:

```text
Inventory

Payments

Notifications
```

---

# 29. Cross-Module Rule

Module A may call only:

```text
Module B published application interface
```

not:

```text
Module B repositories

Module B internal domain entities

Module B tables
```

---

# 30. Orchestration Direction

The application service owning the business use case coordinates participating domains.

Example:

```text
Orders.PlaceOrder
        │
        ├── Customers.resolveCustomer()
        ├── Promotions.claim()
        ├── Inventory.reserve()
        └── Payments.createIntent()
```

---

# 31. Domain Events vs Direct Coordination

Use direct coordination when the result is required for the current transaction.

Example:

```text
Inventory reservation
```

is required before Order commit.

Use events when side effect can happen afterward.

Example:

```text
Send order confirmation.
```

---

# 32. Rule

```text
Required for transaction correctness
→ direct synchronous application interface

Reaction after committed truth
→ domain/outbox event
```

---

# 33. Event Example

```text
OrderPlaced
```

Consumers:

```text
Notifications

Analytics

Webhook Integration
```

Order creation does not depend on those consumers succeeding.

---

# 34. COMMAND CATALOG — CATALOG

## CreateProduct

Owner:

```text
Catalog
```

Permission:

```text
products.create
```

Transaction:

```text
Product
Initial Variant if required
Default structures
Audit
Outbox
```

Idempotency:

```text
Required for external/API/import creation.
Recommended for Admin creation.
```

Result:

```text
Product ID
Version
Editor summary
```

---

# 35. UpdateProduct

Permission:

```text
products.edit
```

Concurrency:

```text
expectedVersion
```

Updates only explicitly editable Product fields.

Does not mutate:

```text
Inventory

Purchasing

Order history
```

---

# 36. PublishProduct

Permission:

```text
products.publish
```

Checks:

```text
Product valid

at least one sellable Variant

required media/configuration

required pricing

publication prerequisites
```

Publication does not require stock > 0.

Emits:

```text
ProductPublished
```

---

# 37. UnpublishProduct

Stops new Storefront sale exposure.

Does not:

```text
delete Orders

delete stock

delete Reviews
```

---

# 38. ArchiveProduct

Requires:

```text
products.archive
```

Preserves all historical references.

---

# 39. CreateVariant

Checks:

```text
valid Product

valid option combination

unique SKU

unique option signature
```

Does not create stock quantity automatically.

May create:

```text
Inventory Item
```

through controlled Catalog→Inventory coordination if V1 workflow enables automatic Inventory Item provisioning.

---

# 40. UpdateVariant

Uses optimistic version.

Protected fields such as:

```text
SKU

physical dimensions

barcode
```

change through explicit input.

Historical Orders unaffected.

---

# 41. ArchiveVariant

Cannot delete historical Variant.

Existing Inventory remains manageable.

Storefront availability becomes unavailable.

---

# 42. LinkProductMedia

Catalog owns the usage relationship.

Media validates:

```text
Asset exists

Organization

visibility/context compatibility
```

---

# 43. SetVariantPrice

Owner:

```text
Catalog/Pricing
```

Permission:

```text
products.pricing.manage
```

Writes price.

Emits pricing change event.

Existing Orders unchanged.

---

# 44. CATALOG QUERIES

```text
GetProductEditor

GetProductAdminDetail

ListProducts

GetStorefrontProduct

GetVariantDetail

ListCategories

GetCategoryTree

GetCollection

SearchCatalog
```

---

# 45. COMMAND CATALOG — SIZING

Commands:

```text
CreateSizeSystem

CreateSizeGuide

CreateSizeGuideRevision

UpdateDraftSizeGuideRevision

PublishSizeGuideRevision

AssignProductSizeGuide
```

Published revision cannot be mutated.

A new edit creates a new revision.

---

# 46. SIZING QUERIES

```text
GetSizeGuideBuilder

GetPublishedSizeGuide

ListSizeSystems

GetProductSizingConfiguration
```

---

# 47. COMMAND CATALOG — MEDIA

Commands:

```text
CreateUploadSession

CompleteUpload

ProcessMediaAsset

UpdateAssetMetadata

ArchiveAsset

DeleteUnusedAsset

RelinkMediaUsage
```

---

# 48. DeleteUnusedAsset

Critical rule:

Before deletion:

```text
check authoritative domain usage
```

not only:

```text
media usage projection.
```

---

# 49. MEDIA QUERIES

```text
SearchMediaLibrary

GetMediaAsset

GetMediaUsageImpact

ListUnusedMedia

GetMediaProcessingStatus
```

---

# 50. COMMAND CATALOG — INVENTORY

## AdjustInventory

Owner:

```text
Inventory
```

Permission:

```text
inventory.adjust
```

Input:

```text
Inventory Item

Location

Adjustment quantity or counted target

Condition

Reason

Expected version where target-based
```

Transaction:

```text
lock Level

validate

Inventory Transaction

Movement Lines

Level update

Audit

Outbox
```

Idempotent.

---

# 51. ChangeInventoryCondition

Example:

```text
INSPECTION → SELLABLE
```

Creates offsetting movement lines under one Inventory Transaction.

---

# 52. CreateInventoryReservation

Normally internal command invoked by Order application.

Not public Admin CRUD.

Checks:

```text
sellable quantity

reserved quantity

location eligibility

oversell policy
```

---

# 53. ReleaseReservation

Safe/idempotent.

Physical On Hand unchanged.

---

# 54. ExpireReservation

SYSTEM command.

Locks Reservation.

Revalidates:

```text
Order state

Payment state

Reservation state
```

before release.

---

# 55. ConsumeReservation

Normally coordinated through Fulfillment.

Uses explicit Reservation Allocation quantities.

---

# 56. StartStocktake

Creates:

```text
Stocktake Session

snapshot quantities
```

---

# 57. RecordStocktakeCount

Does not yet change Inventory.

---

# 58. PostStocktake

Permission:

```text
inventory.stocktake.post
```

Calculates movements occurring after snapshot.

Creates compensating Inventory Transaction.

Idempotent.

---

# 59. RebuildInventoryLevel

Repair command.

Permission:

```text
inventory.repair
```

Allowed only where ledger/reservation authority is trustworthy.

Recalculates projection.

Creates repair audit record.

---

# 60. INVENTORY QUERIES

```text
GetInventoryAvailability

GetInventoryItem

ListInventoryByLocation

GetInventoryLedger

GetReservationDetail

GetStocktakeWorkspace

GetInventoryIntegrityStatus
```

---

# 61. COMMAND CATALOG — WAREHOUSE

Commands:

```text
CreateLocation

UpdateLocation

DeactivateLocation

CreateTransfer

ApproveTransfer

DispatchTransfer

ReceiveTransfer

ResolveTransferDiscrepancy
```

---

# 62. DeactivateLocation

Checks dependencies such as:

```text
current stock

active reservations

active transfers

default receiving/fulfillment configuration
```

May block until resolved.

---

# 63. DispatchTransfer

Coordinates:

```text
Warehouse

Inventory
```

Creates source stock deduction exactly once.

---

# 64. ReceiveTransfer

Posts destination stock according to actual:

```text
sellable

damaged

other condition
```

quantities.

---

# 65. WAREHOUSE QUERIES

```text
ListLocations

GetLocationDetail

GetTransferWorkspace

ListInTransitStock

GetLocationInventorySummary
```

---

# 66. COMMAND CATALOG — PROCUREMENT

Commands:

```text
CreateSupplier

UpdateSupplier

CreatePurchase

UpdateDraftPurchase

ConfirmPurchase

AmendConfirmedPurchase

CancelPurchaseQuantity

RecordSupplierInvoice

RecordSupplierPayment

AllocateSupplierPayment

ResolveSupplierClaim
```

---

# 67. ConfirmPurchase

Checks:

```text
Supplier

Currency

Lines

Quantities

Prices
```

After confirmation, material changes use amendment rather than ordinary edit.

---

# 68. RecordSupplierPayment

Records actual payment.

Allocation to invoice is separate.

Unallocated amount is allowed as Supplier Advance.

---

# 69. PROCUREMENT QUERIES

```text
GetSupplierDetail

ListSuppliers

GetPurchaseWorkspace

ListPurchases

GetSupplierPayables

GetSupplierPaymentHistory

GetPurchaseReceivingSummary
```

`GetPurchaseReceivingSummary` derives received quantities from Shipment/Inbound Receipt chain.

---

# 70. COMMAND CATALOG — SHIPMENT

Commands:

```text
CreateInboundShipment

AddShipmentItem

AllocatePurchaseLineToShipment

UpdateShipmentPlan

DispatchInboundShipment

RecordShipmentArrival

RecordShipmentException

CreateInboundReceipt

UpdateDraftInboundReceipt

ResolveReceiptItem

PostInboundReceipt

CorrectInboundReceipt
```

---

# 71. RecordShipmentArrival

Does not change Inventory.

---

# 72. CreateInboundReceipt

Creates physical receiving workspace.

May contain:

```text
RESOLVED

UNRESOLVED_ITEM
```

lines.

---

# 73. ResolveReceiptItem

Maps physically observed item to:

```text
Inventory Item
```

with controlled Catalog/Procurement context.

No sellable Inventory exists before resolution/posting.

---

# 74. PostInboundReceipt

Permission:

```text
inventory.receiving.post
```

Checks:

```text
all lines resolved

valid conditions

actual quantities

shipment context

duplicate posting
```

Transaction:

```text
Lock Receipt

Create Inventory Transaction

Create Movement Lines

Update Levels

Create acquisition-cost provenance

Mark Receipt POSTED

Outbox

Audit
```

---

# 75. CorrectInboundReceipt

Does not rewrite posted Receipt.

Creates compensating Inventory transaction and correction evidence.

---

# 76. SHIPMENT QUERIES

```text
GetInboundShipmentWorkspace

ListInboundShipments

GetReceivingWorkspace

GetShipmentPurchaseAllocation

GetShipmentVarianceSummary

GetUnresolvedReceivedItems
```

---

# 77. COMMAND CATALOG — LANDED COST

Commands:

```text
CreateLandedCostWorksheet

CreateLandedCostRevision

AddCostComponent

UpdateCostComponent

SetAllocationMethod

CalculateLandedCost

FinalizeLandedCost

CreateLandedCostAdjustment
```

---

# 78. CalculateLandedCost

May operate as calculation command on Draft revision.

Validates required basis.

Produces deterministic allocation preview.

No Inventory quantity changes.

---

# 79. FinalizeLandedCost

Permission:

```text
landed_cost.finalize
```

Checks:

```text
all components allocate exactly

no missing basis

rounding reconciles

source references valid
```

Final revision immutable.

Creates/updates acquisition cost provenance.

---

# 80. LANDED COST QUERIES

```text
GetLandedCostWorksheet

PreviewLandedCostAllocation

GetShipmentCostBreakdown

GetAcquisitionCostProvenance
```

---

# 81. COMMAND CATALOG — CUSTOMERS

Commands:

```text
CreateCustomer

UpdateCustomer

AddCustomerPhone

AddCustomerEmail

AddCustomerAddress

BlockCustomer

UnblockCustomer

AddCustomerNote

MergeCustomers

AnonymizeCustomer
```

---

# 82. ResolveOrCreateCustomer

Internal application operation used by:

```text
Storefront Checkout

Manual Order Creation

Imports
```

Does not blindly merge based on phone equality.

Returns:

```text
resolved existing

created new

duplicate candidate
```

according to identity rules.

---

# 83. MergeCustomers

Permission:

```text
customers.merge
```

Process:

```text
lock both Customers

canonical resolution

cycle check

conflict check

create Merge record

create Alias

update source lifecycle

Audit
```

Historical Orders are not rewritten.

---

# 84. AnonymizeCustomer

High privilege.

Removes/replaces unnecessary PII while preserving required commercial history.

---

# 85. CUSTOMER QUERIES

```text
SearchCustomers

GetCustomer360

GetCustomerOrders

GetCustomerPayments

GetCustomerAddresses

GetCustomerDuplicateCandidates

PreviewCustomerMerge
```

---

# 86. COMMAND CATALOG — CART & CHECKOUT

Commands:

```text
CreateCart

AddCartLine

UpdateCartLine

RemoveCartLine

CreateCheckoutSession

UpdateCheckoutCustomer

SetCheckoutDeliveryMethod

SetCheckoutPaymentMethod

ApplyCoupon

RemoveCoupon

RefreshCheckoutCalculation
```

---

# 87. Cart Commands

Do not reserve Inventory.

---

# 88. RefreshCheckoutCalculation

Returns server-calculated:

```text
items

pricing

discounts

delivery

tax

total

availability warnings

calculationVersion
```

---

# 89. COMMAND CATALOG — ORDERS

## PlaceOrder

Central Storefront command.

Input concept:

```text
Checkout Session ID

Accepted Calculation Version

Customer/address data

Idempotency Key
```

Permission:

```text
Public/Storefront policy
```

Transaction coordinates:

```text
Customers

Catalog/Pricing

Promotions

Inventory

Orders

Payments

Outbox
```

---

# 90. PlaceOrder Result

```text
Order ID

Order Number

Public Order Reference

Payment next step

Order Summary
```

---

# 91. PlaceOrder Errors

Stable examples:

```text
CHECKOUT_CHANGED

ITEM_UNAVAILABLE

ITEM_NO_LONGER_SELLABLE

PROMOTION_NO_LONGER_VALID

PAYMENT_METHOD_UNAVAILABLE

DELIVERY_METHOD_UNAVAILABLE

CUSTOMER_BLOCKED

ORDER_ALREADY_CREATED
```

---

# 92. CreateManualOrder

Admin workflow.

Permission:

```text
orders.create
```

Uses same pricing/inventory/order rules wherever applicable.

Overrides require explicit capability/reason.

Manual Order must not become a backdoor around normal domain validation.

---

# 93. ConfirmOrder

Useful if some Order sources begin in PENDING.

Secures required Inventory if not already secured according to source policy.

---

# 94. PutOrderOnHold

Creates Hold entity.

Does not invent new Order status semantics beyond established lifecycle.

---

# 95. ReleaseOrderHold

Removes specific active Hold.

---

# 96. CancelOrder

Permission:

```text
orders.cancel
```

Coordinates:

```text
Order cancellation

Reservation release

Payment/refund requirement projection

Events
```

Does not erase Payment.

---

# 97. CancelOrderQuantity

Handles partial line cancellation.

Locks current cancellation/fulfillment quantities.

---

# 98. CreateFulfillment

Permission:

```text
orders.fulfill
```

Chooses:

```text
Order Lines

Quantities

Location

Reservation allocations
```

---

# 99. PostFulfillment

Consumes Reservation allocations.

Posts Inventory stock deduction.

Exactly-once link:

```text
Fulfillment
→ Inventory Transaction
```

---

# 100. CompleteOrder

Normally derived/controlled when fulfillment/commercial conditions satisfy policy.

Not arbitrary Admin status setter.

---

# 101. CorrectOrderCustomer

Exceptional repair/correction command.

High privilege.

Preserves snapshot/audit.

---

# 102. ORDER QUERIES

```text
ListOrders

GetOrderWorkspace

GetOrderTimeline

GetOrderFinancialSummary

GetOrderFulfillmentSummary

GetOrderInventoryCommitment

LookupPublicOrder

GetOrderPrintableInvoice
```

---

# 103. COMMAND CATALOG — PAYMENTS

Commands:

```text
CreatePaymentIntent

SubmitPaymentAttempt

VerifyPaymentAttempt

RejectPaymentAttempt

RecordProviderPayment

AllocatePayment

UnallocatePayment

CreateRefund

ProcessRefund

ReconcileRefund

ReversePayment

CreateSettlementBatch

ImportSettlement

ReconcileSettlement
```

---

# 104. SubmitPaymentAttempt

Customer/Admin may submit:

```text
transaction reference

claimed amount

evidence
```

Creates Attempt.

Does not create confirmed Payment.

---

# 105. VerifyPaymentAttempt

Permission:

```text
payments.verify
```

Locks Attempt/provider reference state.

Creates exactly one confirmed Payment.

May allocate to Order.

Actual observed amount is preserved even if it differs from expected.

---

# 106. RecordProviderPayment

Used by authenticated provider processing.

Provider transaction uniqueness prevents duplicates.

---

# 107. AllocatePayment

Cannot allocate more than Payment unallocated amount.

Can allocate real late Payment to:

```text
current Order

different corrective Order

or remain unallocated
```

according to authorized workflow.

---

# 108. CreateRefund

Permission:

```text
payments.refund
```

Locks refundable state.

Checks concurrent completed/pending Refunds.

Creates Refund request.

External provider operation is separate.

---

# 109. ProcessRefund

Worker/System operation.

Creates:

```text
Integration Operation
```

before external call.

Handles:

```text
confirmed success

confirmed failure

unknown outcome
```

---

# 110. ReconcileRefund

Queries provider/settlement source and resolves unknown external outcome.

---

# 111. ReversePayment

High privilege.

Used for incorrect/fraudulent Payment recording—not customer Refund.

---

# 112. PAYMENT QUERIES

```text
GetPaymentWorkspace

GetPaymentAttempt

GetPaymentHistory

GetOrderPaymentSummary

GetRefundWorkspace

GetPaymentReconciliation

GetSettlementWorkspace

ListUnallocatedPayments
```

---

# 113. COMMAND CATALOG — FINANCE

Commands:

```text
CreateFinancialAccount

DeactivateFinancialAccount

CreateExpense

UpdateDraftExpense

RecordExpense

RecordExpensePayment

CreateExpenseAdjustment

CreateFinancialTransfer

RecordOpeningBalance

ReconcileFinancialAccount
```

---

# 114. CreateExpense

Creates economic Expense.

Does not automatically imply Payment occurred.

---

# 115. RecordExpensePayment

Coordinates:

```text
Expense

Finance Transaction

Financial Account Entry
```

---

# 116. CreateExpenseAdjustment

Types:

```text
CREDIT

CORRECTION

REVERSAL
```

Original recorded Expense remains.

---

# 117. CreateFinancialTransfer

Creates one Finance Transaction with opposing account entries.

Principal transfer is not Expense.

---

# 118. RecordOpeningBalance

Explicit historical initialization command.

Never direct balance setter.

---

# 119. FINANCE QUERIES

```text
GetFinanceDashboard

ListExpenses

GetExpenseDetail

GetExpenseOutstandingBalance

ListFinancialAccounts

GetFinancialAccountLedger

GetCashPosition

GetFinanceReconciliationWorkspace
```

---

# 120. COMMAND CATALOG — REVIEWS

Commands:

```text
CreateReviewInvitation

SubmitReview

SubmitReviewRevision

WithdrawReview

ApproveReviewRevision

RejectReviewRevision

HideReview

RestoreReview

CreateMerchantResponse

UpdateMerchantResponse

ImportReview
```

---

# 121. SubmitReview

Checks:

```text
Review credential/order eligibility

Customer

Product

duplicate active Review

rating

media
```

Client cannot set:

```text
verified purchase

moderation state
```

---

# 122. SubmitReviewRevision

If Review already published:

```text
previous published revision remains visible
```

while new revision awaits moderation.

---

# 123. ApproveReviewRevision

Sets:

```text
published_revision_id
```

and updates Review aggregate projection.

---

# 124. RejectReviewRevision

If old published revision exists:

```text
old revision remains.
```

---

# 125. REVIEWS QUERIES

```text
GetProductReviewSummary

ListPublicProductReviews

ListModerationQueue

GetReviewModerationDetail

GetCustomerReviewEligibility
```

---

# 126. COMMAND CATALOG — PROMOTIONS

Commands:

```text
CreatePromotion

CreatePromotionRevision

ConfigurePromotionConditions

ActivatePromotionRevision

DeactivatePromotion

CreateCouponCode

DisableCouponCode

CommitPromotionUsage

ReleasePromotionUsage
```

---

# 127. EvaluatePromotions

Important distinction:

```text
EvaluatePromotions
```

is a calculation/query-like application service.

It does not commit Usage.

Used by:

```text
Cart

Checkout
```

---

# 128. CommitPromotionUsage

Occurs transactionally during successful Order creation.

Concurrency-safe.

---

# 129. PROMOTION QUERIES

```text
EvaluatePromotions

GetPromotionEditor

ListPromotions

GetCouponUsage

GetPromotionPerformance
```

---

# 130. COMMAND CATALOG — NOTIFICATIONS

Commands:

```text
CreateNotification

DispatchNotification

RetryNotification

CancelPendingNotification
```

Most are SYSTEM/internal.

---

# 131. CreateNotification

Usually event consumer creates concrete Notification using published Template revision.

---

# 132. DispatchNotification

Provider failure does not alter originating business domain.

---

# 133. NOTIFICATION QUERIES

```text
GetNotification

ListNotificationFailures

GetNotificationHealth

GetCustomerNotificationHistory
```

---

# 134. COMMAND CATALOG — INTEGRATIONS

Commands:

```text
CreateIntegration

ConfigureIntegrationAccount

ActivateIntegration

DisableIntegration

RotateIntegrationSecret

CreateExternalOperation

ExecuteExternalOperation

ReconcileExternalOperation

ResolveIntegrationException

CreateWebhookEndpoint

UpdateWebhookEndpoint

RotateWebhookSecret

RetryWebhookDelivery
```

---

# 135. ExecuteExternalOperation

Must operate on previously persisted:

```text
Integration Operation
```

so crash/timeout can be reconciled.

---

# 136. Unknown Outcome

Handler records:

```text
UNKNOWN_OUTCOME
```

rather than treating timeout as confirmed failure.

---

# 137. ReconcileExternalOperation

Checks provider using stable merchant/external reference.

Transitions to:

```text
CONFIRMED_SUCCESS

CONFIRMED_FAILURE

RECONCILIATION_REQUIRED
```

---

# 138. INTEGRATION QUERIES

```text
GetIntegrationHealth

ListIntegrationExceptions

GetIntegrationOperation

GetWebhookEndpoint

ListWebhookDeliveries

GetProviderEvent
```

---

# 139. COMMAND CATALOG — PLATFORM / IAM

Commands:

```text
InviteMembership

ActivateMembership

DisableMembership

GrantCapability

RevokeCapability

AssignScope

RemoveScope

TransferOwnership

CreateServiceAccount

CreateApiCredential

RevokeApiCredential

EnableMfa

DisableMfa

RevokeSession

RevokeAllUserSessions
```

---

# 140. GrantCapability

Permission:

```text
access.manage
```

Must enforce delegation ceiling/Owner policy.

Audit mandatory.

---

# 141. DisableMembership

Revokes authorization promptly.

Can trigger active Session revocation.

---

# 142. TransferOwnership

Requires:

```text
step-up authentication

current Owner

valid target Membership

audit

notification
```

---

# 143. IAM QUERIES

```text
ListMemberships

GetMembershipPermissions

GetCurrentAuthorizationContext

ListSessions

ListServiceAccounts

ListApiCredentials

GetAccessAudit
```

---

# 144. COMMAND CATALOG — PLATFORM REPAIR

Repair commands:

```text
RebuildInventoryLevel

RebuildReviewAggregate

RebuildOrderFinancialSummary

RebuildSearchProjection

RebuildAnalyticsProjection

ResolveIntegrityIssue

ReconcileMediaStorage

ReconcileProviderPayment

RelinkExternalEntity

RetryDeadLetterJob
```

---

# 145. Repair Command Rules

Every repair command requires:

```text
specific capability

reason

target issue

audit

before/after evidence
```

No generic repair endpoint exists.

---

# 146. Query Service Architecture

Queries can use:

```text
purpose-built SQL

database views

projection tables

read repositories
```

and do not need to reconstruct write-domain aggregates merely to display information.

This separation is a normal simplified CQRS pattern.

---

# 147. Query Folder Convention

Example:

```text
modules/orders/application/
├── commands/
│   ├── place-order/
│   ├── cancel-order/
│   └── create-fulfillment/
│
└── queries/
    ├── get-order-workspace/
    ├── list-orders/
    └── get-order-timeline/
```

---

# 148. Command Folder

Example:

```text
place-order/
├── place-order.command.ts
├── place-order.handler.ts
├── place-order.result.ts
├── place-order.errors.ts
└── place-order.spec.ts
```

---

# 149. Query Folder

Example:

```text
get-order-workspace/
├── get-order-workspace.query.ts
├── get-order-workspace.handler.ts
├── order-workspace.dto.ts
└── get-order-workspace.spec.ts
```

---

# 150. Framework Independence

This architecture does not require:

```text
NestJS CQRS package

MediatR equivalent

custom command bus
```

Those are implementation choices.

NestJS does provide an official CQRS package/pattern if selected later, but Maevelle's architectural contract should remain independent of it.

---

# 151. Command Bus

A lightweight internal Command Dispatcher may provide:

```text
central middleware

authorization integration

idempotency

logging

metrics

transaction handling
```

but should not become opaque magic.

---

# 152. Query Bus

Optional.

Queries can also be explicit injectable services.

Consistency matters more than framework ceremony.

---

# 153. Application Result

Command handler returns:

```text
semantic application result
```

not HTTP-specific response.

Example:

```ts
{
  (orderId, orderNumber, publicReference, paymentNextStep);
}
```

API layer decides:

```text
HTTP 201
```

---

# 154. Error Contract

Application errors are stable codes.

Example:

```text
ORDER_ITEM_UNAVAILABLE

ORDER_ALREADY_CANCELLED

PAYMENT_ALREADY_VERIFIED

REFUND_AMOUNT_EXCEEDS_AVAILABLE

VERSION_CONFLICT

CUSTOMER_MERGE_CONFLICT
```

---

# 155. No Exception String Parsing

Controller must not detect domain situation through:

```text
if (error.message.includes("stock"))
```

---

# 156. Error Classes

Conceptual classes:

```text
ValidationError

AuthorizationError

NotFoundError

ConflictError

DomainRuleViolation

ConcurrencyError

IntegrationUncertainOutcome

TemporaryInfrastructureError
```

---

# 157. Command Idempotency Categories

### REQUIRED

```text
PlaceOrder

PostInboundReceipt

PostFulfillment

VerifyPayment

CreateRefund

RecordSupplierPayment

External Create Delivery

Provider Callback Processing
```

### RECOMMENDED

```text
CreateProduct

CreatePurchase

CreateExpense
```

### NOT NORMALLY REQUIRED

Simple deterministic edits protected by:

```text
expectedVersion
```

though API clients may still supply an idempotency key.

---

# 158. Query Idempotency

Queries must be safe to execute repeatedly.

They do not mutate:

```text
last viewed

notification read state

counters
```

implicitly.

If view tracking is needed:

```text
RecordProductView
```

is a separate event/command.

---

# 159. Query Freshness Classes

### AUTHORITATIVE

Required for:

```text
Checkout final validation

Payment reconciliation

Inventory availability during reservation
```

### OPERATIONAL PROJECTION

Suitable for:

```text
Order list

Inventory dashboard

Customer stats
```

### EVENTUALLY CONSISTENT

Suitable for:

```text
Analytics

Search

Review aggregate
```

---

# 160. Query Metadata

Projection queries should be able to expose:

```text
updatedAt

freshness

projectionVersion
```

where stale state matters operationally.

---

# 161. Command Events

A command can emit multiple domain events.

Example:

```text
PlaceOrder
```

may emit:

```text
OrderPlaced

InventoryReserved

PromotionUsageCommitted

PaymentIntentCreated
```

Each domain owns its fact.

---

# 162. Avoid Giant Event

Bad:

```text
CheckoutCompletedEverythingEvent
```

containing every domain detail.

Prefer domain facts.

---

# 163. Outbox Rule

Events triggered by committed state must be persisted within the same local database transaction where required.

---

# 164. Audit Rule

Commands changing:

```text
money

inventory

permissions

security

customer identity

configuration

commercial state
```

must produce Audit evidence.

---

# 165. Audit Is Not Event Publishing

Domain Event:

```text
OrderCancelled
```

Audit:

```text
Membership X cancelled Order Y
because CUSTOMER_REQUESTED.
```

Different purposes.

---

# 166. Command Observability

Every command execution records operational metadata:

```text
command

duration

organization

success/failure class

request ID

correlation ID
```

without logging sensitive payloads.

---

# 167. Query Observability

Track:

```text
query name

duration

row count where useful

cache/projection source

slow execution
```

---

# 168. Long-Running Commands

Commands that cannot complete safely within normal HTTP lifecycle create:

```text
Job
```

Examples:

```text
Bulk Product Import

Large Export

Analytics Rebuild

Media Reprocessing
```

---

# 169. Async Command Pattern

```text
HTTP
 ↓
RequestBulkImport
 ↓
Create Job
 ↓
202 Accepted
 ↓
Worker
 ↓
Execute Import Application Service
```

---

# 170. Async Does Not Mean Fire-and-Forget

Job has:

```text
status

attempt

result

error

audit

actor context
```

---

# 171. User-Requested Job Authorization

When delayed sensitive work executes:

```text
authorization_mode = REVALIDATE_INITIATOR
```

Examples:

```text
Customer Export

Bulk Refund
```

---

# 172. System Jobs

Examples:

```text
ExpireReservation

ReconcileProviderPayment

RebuildProjection
```

execute under:

```text
SYSTEM principal
```

with tightly defined capabilities.

---

# 173. Bulk Commands

Bulk operation should use individual semantic commands where integrity requires it.

Example Product import:

```text
Import Batch
    ↓
row 1 → CreateProduct
row 2 → CreateProduct
row 3 → validation failure
```

Result preserves each row outcome.

---

# 174. Do Not Bypass Domain for Performance

Forbidden optimization:

```text
COPY 100,000 rows directly into inventory_levels
```

for Inventory import.

---

# 175. Internal Module APIs

Example Inventory published application API:

```text
getAvailability()

reserve()

release()

consume()

adjust()

postConditionChange()
```

---

# 176. Orders Must Not Call

```text
inventoryRepository.updateLevel()
```

---

# 177. Payment Published API

Potential:

```text
createIntent()

getCollectionSummary()

allocatePayment()

getRefundableAmount()
```

---

# 178. Customer Published API

Potential:

```text
resolveOrCreate()

getCustomerReference()

canonicalizeCustomerId()
```

---

# 179. Promotions Published API

Potential:

```text
evaluate()

commitUsage()

releaseUsage()
```

---

# 180. Application Boundary Test

Architecture test should fail build if:

```text
orders
imports
inventory/infrastructure/*
```

directly.

---

# 181. Repository Ownership

Only domain module owning a table uses its write repository.

Cross-domain queries may use read-query infrastructure where appropriate.

---

# 182. Cross-Domain Query Exception

Example:

```text
GetOrderWorkspace
```

may perform optimized read joins over:

```text
orders

customers

payments
```

because it is read-only.

This does not grant Orders write access to Payment tables.

---

# 183. Query DB Access

Query handlers can use:

```text
SQL/query builder
```

directly against approved read relationships where that is simpler and more efficient.

They still enforce organization/scope rules.

---

# 184. Transaction Read vs Projection Read

A command never relies on stale projection for critical validation.

Example:

```text
PlaceOrder
```

cannot use:

```text
product_search_documents.availability_state
```

as stock authority.

---

# 185. Application Service Invariant

### APP-INV-001

All business mutations occur through explicit semantic commands.

### APP-INV-002

Queries do not mutate business state.

### APP-INV-003

HTTP controllers do not contain business workflows.

### APP-INV-004

Workers reuse application services rather than duplicating domain logic.

### APP-INV-005

External callbacks enter domains through normalized application commands.

### APP-INV-006

One module cannot write another module's tables directly.

### APP-INV-007

Cross-domain synchronous calls use published application interfaces.

### APP-INV-008

Cross-domain reactions that are not required for current transaction use events/outbox.

### APP-INV-009

Command handlers own transaction boundaries.

### APP-INV-010

Repositories do not independently commit business transactions.

### APP-INV-011

External HTTP calls do not remain inside long-running critical database transactions.

### APP-INV-012

Commands accept intent, not caller-controlled resulting domain status.

### APP-INV-013

Every protected command is authorized server-side.

### APP-INV-014

Resource-level and scope authorization remain necessary after capability checks.

### APP-INV-015

Critical commands define explicit idempotency semantics.

### APP-INV-016

Same Idempotency Key with materially different input is rejected.

### APP-INV-017

Concurrency-sensitive commands define locking/version strategy.

### APP-INV-018

Commands never trust read/search/analytics projections as transactional authority.

### APP-INV-019

Posted ledger/history records are corrected through semantic compensation commands.

### APP-INV-020

Repair workflows use dedicated repair commands rather than arbitrary database mutation.

### APP-INV-021

Queries return purpose-built DTOs rather than domain/ORM entities.

### APP-INV-022

Cross-domain read models may join domains without granting cross-domain write access.

### APP-INV-023

Sensitive query fields remain permission-filtered.

### APP-INV-024

Every command result is transport-independent.

### APP-INV-025

Application errors use stable machine codes rather than message parsing.

### APP-INV-026

Committed domain events are persisted reliably through the Outbox where required.

### APP-INV-027

Audit and Domain Events remain separate concepts.

### APP-INV-028

Async jobs preserve actor provenance.

### APP-INV-029

Delayed sensitive user jobs revalidate authorization where required.

### APP-INV-030

SYSTEM jobs operate under explicit system authority rather than fabricated human identity.

---

# 186. Application Service Definition of Done

No Command is implementation-ready until documented:

```text
Name

Owner Module

Caller Types

Input

Output

Permission

Scope

Validation

Domain Rules

Repositories/modules touched

Transaction

Locks

Idempotency

Events

Audit

Errors

Retry behavior

Tests
```

---

# 187. Query Definition of Done

No important Query is implementation-ready until documented:

```text
Name

Audience

Permission

Scope

DTO

Data sources

Projection/source freshness

Pagination

Filters

Sorting

Sensitive fields

Expected performance

Indexes supporting it
```

---

# 188. Required Command Concurrency Tests

Must include:

```text
PlaceOrder

CancelOrder

PostInboundReceipt

PostFulfillment

AdjustInventory

PostStocktake

CommitPromotionUsage

VerifyPaymentAttempt

CreateRefund

MergeCustomers

AllocateSupplierPayment

CreateExternalOperation
```

---

# 189. Required Idempotency Tests

Must include:

```text
PlaceOrder

PostInboundReceipt

PostFulfillment

Payment Verification

Refund

Provider Callback

External Courier Creation

Supplier Payment

Bulk Import Row
```

---

# 190. Required Authorization Tests

Every privileged command needs:

```text
allowed

capability denied

scope denied

cross-organization denied

disabled Membership denied
```

---

# 191. Required Query Tests

At minimum:

```text
organization isolation

permission filtering

sensitive-field masking

pagination stability

filter correctness

sorting stability

projection freshness handling
```

---

# 192. Implementation Folder Architecture

Recommended:

```text
packages/core/src/modules/
├── catalog/
│   ├── domain/
│   ├── application/
│   │   ├── commands/
│   │   └── queries/
│   ├── infrastructure/
│   └── public/
│
├── inventory/
│   └── ...
│
├── orders/
│   └── ...
│
└── payments/
    └── ...
```

---

# 193. API Mapping Example

```text
POST /api/admin/v1/orders/{id}/cancel
               │
               ▼
        CancelOrderCommand
               │
               ▼
        CancelOrderHandler
               │
               ├── Authorization
               ├── Order
               ├── Inventory
               └── Outbox
```

---

# 194. Storefront Mapping Example

```text
POST /api/storefront/v1/checkouts/{id}/order
               │
               ▼
          PlaceOrderCommand
               │
               ▼
          PlaceOrderHandler
```

Same Order domain can later be called from:

```text
Mobile App

External API

Admin
```

without rebuilding business logic.

---

# 195. Worker Mapping Example

```text
Reservation Expiry Job
        │
        ▼
ExpireReservationCommand
        │
        ▼
Inventory Application
```

---

# 196. Provider Mapping Example

```text
Provider Webhook
      │
      ▼
Payment Adapter
      │
      ▼
Normalize Provider Event
      │
      ▼
ReconcileProviderPaymentCommand
```

---

# 197. Command Evolution

Commands are internal application contracts.

They may evolve faster than public API versions.

However:

```text
Jobs

delayed messages

external integration events
```

need payload versioning when persisted beyond one release.

---

# 198. Query Evolution

UI queries can evolve with Admin/Storefront.

External Integration API queries require public version compatibility.

---

# 199. Application Service Architecture Result

We now have:

```text
Frontend
    ↓
API
    ↓
COMMAND / QUERY
    ↓
APPLICATION SERVICE
    ↓
DOMAIN MODULE
    ↓
REPOSITORY / PUBLISHED MODULE API
    ↓
POSTGRESQL
```

Async:

```text
COMMIT
  ↓
OUTBOX / JOB
  ↓
APPLICATION COMMAND
  ↓
PROVIDER / PROJECTION
```

---

# 200. Major Benefit

This prevents a common implementation failure where:

```text
Storefront creates Order one way

Admin creates Order another way

Import creates Order a third way

API creates Order a fourth way
```

Instead:

```text
all roads
    ↓
Order Application Services
```

with differences expressed as:

```text
source

permissions

policy

explicit override
```

rather than duplicated business logic.

---

# 201. Recommended Next Document

The next source-of-truth document should be:

```text
docs/architecture/api-openapi-contract-specification.md
```

because we now know:

```text
what commands exist

what queries exist

who may call them

what they return

what errors exist

where transactions happen
```

The API specification can therefore safely map these application contracts into actual HTTP interfaces.

The next document should define:

```text
Storefront API routes

Admin API routes

Integration API routes

Provider callback routes

Request schemas

Response DTOs

Error envelopes

HTTP status mapping

Pagination

Filtering

Sorting

Idempotency headers

Expected-Version / ETag policy

Authentication requirements

Capability requirements

Rate limits

API versioning

OpenAPI generation rules

Webhook event schemas
```

Examples:

```text
POST /api/storefront/v1/checkouts/{checkoutId}/orders

POST /api/admin/v1/orders/{orderId}/cancel

POST /api/admin/v1/inventory/adjustments

POST /api/admin/v1/inbound-receipts/{id}/post

POST /api/admin/v1/payments/attempts/{id}/verify

POST /api/admin/v1/refunds

GET /api/admin/v1/orders

GET /api/admin/v1/orders/{id}

GET /api/storefront/v1/products/{handle}

GET /api/storefront/v1/search
```

After that, the remaining design sequence becomes much more implementation-oriented:

```text
API / OpenAPI Specification
        ↓
Admin Information Architecture
        ↓
Storefront UX Architecture
        ↓
Testing Master Plan
        ↓
Operations / Runbooks
        ↓
Implementation Roadmap
        ↓
Migration + Code Implementation
```

---

**End of Application Services, Commands & Queries Architecture v0.1**
