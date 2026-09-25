# Current Focus

## Active Area

Delivery / Fulfillment Operations

## Current Status / Substage

`DELIVERY_IMPLEMENTATION_COMPLETE / EXTERNAL_CONFIGURATION_REQUIRED`

## Evidence Already Known

The Delivery/Fulfillment implementation is complete. Pathao provides encrypted
authentication/token refresh, Store sync/mapping, quote, durable booking,
consignment tracking through polling, safe normalization, actual charge capture,
COD mapping, and Returns-owned RTO behavior. Customer delivery history and
explainable internal risk are available in Delivery and Customer workspaces.

## Immediate Objective

Configure owner-supplied Pathao Merchant sandbox credentials, map the intended
pickup Store, and perform one controlled quote/booking/tracking smoke test.

## Last Completed Action

Rebuilt the disposable databases from the mutable baseline and passed 18 focused
Fulfillment/Delivery/Returns/Pathao tests plus Database/API/Worker/Admin type
checks and Admin/Storefront production builds.

## Important Constraints

Do not move Inventory before physical handover, make provider calls inside a
business transaction, retry unknown booking outcomes as new consignments, turn
provider COD evidence directly into money truth, or make returned stock
SELLABLE before inspection/disposition.

## Blockers / Owner Review

No Delivery-domain code blocker is recorded. Real Pathao connection and parcel
verification require Merchant credentials/access not present in the repository.
Owner visual review remains pending as a distinct review gate.
