# Using SMS Notifications in Maevelle · Operations Guide

Maevelle includes a visual **SMS Operations Console** (`/sms`) designed as an operational control center for store operators, staff, and administrators.

The current production state of the platform is:

```text
Maevelle SMS Platform: READY
Production SMS Provider: NOT YET CONNECTED
Automatic Real Sending: DISABLED
```

This is an **expected, valid operational state**. The platform is fully built, tested, and ready before connecting an external Bangladesh telecom gateway.

---

## 1. Navigating the SMS Console

The SMS console is organized into seven operational tabs:

### Overview (`/sms?tab=overview`)
- **System Readiness**: Immediate visual confirmation of platform readiness vs provider connection.
- **Provider Status**: Shows `Not Connected` (or `Mock Provider` in development) with a clear badge.
- **Worker Health**: Real-time worker state, queue size, and oldest queued message timestamp.
- **Today's Operations**: Instant counts for Created, Queued, Accepted, Delivered, Failed, Skipped, Suppressed, and billable Segments.
- **Recent SMS**: Quick-access stream of recent notifications with status badges.
- **Global Kill-Switch Banner**: Prominently warns operators if SMS sending is disabled, clarifying that order processing continues unaffected while queued messages remain held.

### Activity (`/sms?tab=activity`)
- **Lifecycle Log**: Server-paginated, searchable history of all transactional SMS.
- **Deep Search**: Instant lookup by order number, recipient phone, notification ID, or provider message ID.
- **Server Filters**: Filter by Status, Business Event, Trigger Type (`AUTOMATIC`, `MANUAL`, `TEST`, `RESEND`), Encoding (`GSM-7`, `Unicode`), Provider, and Date range. Filter state is preserved in the URL for shareable troubleshooting.
- **Zero Dangerous Bulk Actions**: No mass resend buttons exist; each message is individually audited to protect customer experience and company budget.

### Templates (`/sms?tab=templates`)
- **Approved Message Catalog**: Version-controlled, code-backed templates for each business event.
- **Phone Message Preview**: Displays rendered SMS inside a phone mockup card.
- **Fixture Selection**: Realistic sample scenarios:
  - *Simple COD Order*: Short reference and COD total.
  - *Multi-Item Order*: Standard basket total.
  - *Discounted Order*: Promotional discount applied.
  - *Long Tracking Link*: Extended tracking query parameters near segment boundaries.
  - *Bangla Customer Name*: Tests Unicode character set expansion.
- **Preview Using Real Orders**: Render any existing order snapshot with **zero send side effects**.
- **Fixture Comparison Matrix**: One-click side-by-side comparison across all 5 customer scenarios showing character count, encoding, and billable segment requirements.

### Test Lab (`/sms?tab=test-lab`)
- **Deterministic Mock Lifecycle**: Safe testing environment available in development and staging.
- **Controlled Scenarios**:
  - `Accepted`: Provider accepts message; handset delivery unconfirmed.
  - `Delivered`: Provider accepts and confirms delivery.
  - `Delayed`: Provider reports message still in transit.
  - `Temporary Failure`: Creates a retryable error with scheduled backoff.
  - `Permanent Failure`: Fails without automatic retry.
  - `Rate Limited`: Tests rate-limiting handling.
  - `Unknown Outcome`: Simulates network timeouts, testing duplicate-send protections.
  - `Undeliverable`: Simulates network rejection.
- **Test Recipient Safeguards**: Strictly enforces allow-listed test phone numbers (`SMS_ALLOWED_TEST_RECIPIENTS`).
- **Test Override Banner**: Clearly warns when recipient redirection is active.

### Policies (`/sms?tab=policies`)
- **Granular Event Controls**: Manage each business event (`Order Placed`, `Order Confirmed`, `Payment Confirmed`, `Order Dispatched`, `Order Delivered`, `Order Cancelled`, `Refund Completed`).
- **Three Independent Switches**:
  - *SMS Event Enabled*: Allows the event to participate in SMS messaging.
  - *Automatic Sending*: Automatically creates SMS when the event triggers.
  - *Manual Send Allowed*: Permits authorized operators to send the message manually.
- **Audited Policy Changes**: Operator name, before/after values, and a mandatory reason are permanently logged.
- **Eligibility Hierarchy**: Visual decision path explaining how policy, phone validation, suppression, and provider status determine sending outcomes.

### Suppressions (`/sms?tab=suppressions`)
- **Recipient Protection**: Registry of phone numbers blocked from receiving transactional SMS.
- **Legitimate Reasons**: Invalid Number, Permanent Delivery Failure, Customer Opt-Out Request, Admin Suppression, Provider Block.
- **Safe Clearance**: Clearing a suppression requires explicit operator confirmation, an audit reason, and appropriate permissions.

### Provider & Diagnostics (`/sms?tab=diagnostics`)
- **Honest Truthfulness**: Separates *Selected*, *Configured*, *Reachable*, *Sender Approved*, and *Callback Working*.
- **Provider Capability Matrix**: Displays which features the active adapter supports (Transactional Send, Unicode, Delivery Webhooks, Status Polling, Masking Sender, Balance Query, Cost Reporting).
- **Sender Guidance**: Explains Masking (brand name like `MAEVELLE`) vs Non-Masking (numeric/provider identity).
- **Provider Selection Requirements**: Reference guide for evaluating future Bangladesh SMS gateways.
- **Production Activation Checklist**: Step-by-step verification checklist before enabling live production SMS.

---

## 2. Understanding SMS Delivery Statuses

Maevelle distinguishes between provider handoff and handset delivery:

| Status | Icon | Operational Meaning | Action Required? |
| :--- | :--- | :--- | :--- |
| **Queued** | Clock | In the database queue waiting for the background SMS worker. | None (automatic) |
| **Sending** | Spinner | Claimed by a worker under a database lease and being dispatched to provider. | None |
| **Accepted** | Paper Plane | **Provider accepted the request.** Handset delivery is NOT confirmed yet. | None (wait for report) |
| **Delivered** | Green Check | **Mobile network confirmed handset delivery.** | None (success) |
| **Delayed** | Amber Clock | Provider is still attempting handset delivery. | None (monitoring) |
| **Failed** | Red X | Confirmed technical failure. Safe to retry if transient. | Inspect attempt log |
| **Rejected** | Red X | Provider rejected message (e.g. invalid sender or blocked content). | Review sender/content |
| **Undeliverable** | Red X | Handset unreachable or carrier rejected delivery. | Verify customer phone |
| **Outcome Uncertain** | Purple Help | Provider request timed out. Acceptance is unknown. | **Do NOT resend** (wait) |
| **Suppressed** | Gray Ban | Recipient is in the suppression registry. | Check suppression tab |
| **No Phone** | Gray Ban | Order snapshot has no customer phone number. | Update contact if needed |
| **Skipped** | Gray Ban | Event policy or global SMS switch is disabled. | Informational |

---

## 3. GSM-7 vs. Unicode and Billable Segments

- **GSM-7 Character Set**: Standard SMS encoding allowing **160 characters** for single messages (or **153 characters/segment** for multi-part messages).
- **Unicode (UCS-2)**: Required when messages contain **Bengali text** or non-GSM symbols (like em-dash `—` or smart quotes). Allows only **70 characters** for single messages (or **67 characters/segment** for multi-part messages).
- **Boundary Warnings**: When a message has 10 or fewer characters remaining in the current segment, the console displays a warning to help operators avoid accidental extra billing segments.
- **Non-GSM Character Diagnostics**: When a message unexpectedly becomes Unicode, the console pinpoints the exact character causing the switch (e.g. `“—”`).

---

## 4. Technical Retry vs. New Resend Copy

Maevelle strictly separates technical continuation from duplicate messaging:

### Retry Delivery
- **Purpose**: Continue the **same logical SMS** after a confirmed technical failure (e.g. transient gateway timeout).
- **Rules**: Available only when the status is `FAILED`. Never creates a duplicate notification. Does not charge for an additional logical communication.

### Send Another Copy (Resend)
- **Purpose**: Send a **brand-new copy** to the customer (e.g. customer accidentally deleted their confirmation SMS).
- **Rules**: Available for completed or terminal notifications. Clearly warns that an additional provider charge may apply. Creates a new audited notification record with a lineage link back to the original SMS (`parent_notification_id`).

### Unknown Provider Outcome Protection
- When an SMS is in `Outcome Uncertain` (`UNKNOWN_PROVIDER_OUTCOME`), **both Retry and Resend are disabled**.
- *Reason*: Sending another message while the provider might already have accepted the first request risks sending duplicate SMS to the customer and incurring duplicate charges.

---

## 5. Order Detail SMS Integration

On every Order detail page (`/orders/[id]`), the **Customer Communications / SMS** card provides complete deliverability context:

1. **Order Phone Snapshot**: Shows customer phone formatted for Bangladesh (`01712-345678`), normalized E.164 (`+8801712345678`), validation state, and suppression state.
2. **Event Delivery History**: Shows status badges for Order Received, Order Confirmed, Order Dispatched, and Order Delivered.
3. **Decision Checklist**: An expandable *"Why was or wasn't this SMS sent?"* checklist evaluating:
   - Global SMS enabled?
   - Event policy enabled?
   - Automatic sending enabled?
   - Order reached required state?
   - Customer phone valid?
   - Recipient not suppressed?
   - SMS provider configured?
4. **Order Confirmation Feedback**: When confirming an order, the console shows two separate, decoupled messages:
   - `Order confirmed successfully`
   - `SMS: Queued` OR `SMS: Not sent — production provider not configured`
   - *The order confirmation NEVER fails or looks broken because of SMS.*
5. **Safe Manual Send**: If policy permits, operators can send an approved template with a preview modal, segment estimate, and audit reason.

---

## 6. What Can Admins Change vs. What Requires Developers?

| Action | Admin Role | Developer / Deployment |
| :--- | :--- | :--- |
| Toggle Event Policies (Enable / Auto / Manual) | ✓ (Audited) | — |
| Suppress or Clear Recipient Phone | ✓ (Audited) | — |
| Preview Templates with Fixtures / Orders | ✓ | — |
| Send Manual Order SMS (where permitted) | ✓ (Audited) | — |
| Retry Confirmed Failed SMS | ✓ (Audited) | — |
| Resend SMS Copy | ✓ (Audited) | — |
| Run Test Lab Mock Scenarios | ✓ (Dev/Staging) | — |
| Connect Real SMS Provider Adapter | — | ✓ (Code + Secrets) |
| Configure Provider API Credentials | — | ✓ (Deployment Secrets) |
| Submit Masking Sender Approval to BTRC/Telco | — | ✓ (Telecom Portal) |
| Change Global Kill Switch (`SMS_ENABLED`) | — | ✓ (Runtime Config) |

