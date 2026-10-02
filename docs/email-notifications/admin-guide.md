# Email Notifications Admin Guide

Open **Email operations** (`/email`) in Admin.

The Maevelle Transactional Email System provides an operational control center for managing customer communications, monitoring Resend delivery health, inspecting templates, testing dispatches, configuring event policies, and managing recipient suppressions.

---

## Architecture & Principles

1. **Transactional Decoupling**: Business state transitions (order placement, confirmation, dispatch, delivery, refund) commit immediately. Notifications are enqueued via transactional outbox patterns. Email worker failures never block or corrupt orders.
2. **Server-Authoritative Eligibility**: The frontend never guesses or simulates email state. Eligibility calculations (`getOrderEmailEligibility`) evaluate global kill-switches, event policies, business state prerequisites, customer email availability, and suppression status on the server.
3. **No Fake Health Indicators**: The Diagnostics tab truthfully distinguishes between environment configuration presence and live verification. Secret keys are never exposed in the UI.
4. **Human Support Reply-To**: All transactional outgoing messages set `Reply-To: maevelleBangladesh@gmail.com` as the human customer service mailbox. Resend is purely the delivery infrastructure.

---

## Email Operations Surfaces (`/email`)

The Email Operations Console is organized into 7 modular, URL-synchronized tabs:

### 1. Overview Dashboard (`/email?tab=overview`)
- **System Status Cards**: Global Sending (Enabled/Disabled), Delivery Provider (Resend), Environment Mode (Production / Development / Staging), Configuration Presence (API Key & Webhook Secret status).
- **Deliverability Health**: 7-day total volume, successful deliveries, failures, and delivery success percentage.
- **Worker Health**: Queue backlog age, active queued & processing jobs, top failure reason, and operational status (`HEALTHY`, `BACKLOG`, `DEGRADED`, `IDLE`).
- **Telemetry & Diagnostics**: Last webhook receipt timestamp, webhook health, and direct access to triage failed dispatches.

### 2. Activity Ledger (`/email?tab=activity`)
- **Server-Side Pagination & Filtering**: Filter by delivery status (`QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `COMPLAINED`, `SUPPRESSED`, etc.), trigger type (`AUTOMATIC`, `MANUAL`, `TEST`, `RESEND`), notification type, recipient, order ID, customer ID, or freeform search.
- **Visual Status Badges**: Unified iconography and accessible tooltips explaining exact delivery state.
- **Contextual Actions**: Inspect full delivery timeline, view linked order, view linked customer, and quick-retry failed records.

### 3. Templates Gallery & Rich Preview (`/email?tab=templates`)
- **Template Cards**: Displays friendly name, template key, version number, triggering canonical event, automatic status, and manual send permissions.
- **Interactive Multi-Device Preview**:
  - **Desktop Mode**: Realistic 640px email container.
  - **Mobile Mode**: Responsive 375px viewport simulating smartphone email clients.
  - **Plain-Text View**: Text fallback rendering with one-click copy utility.
  - **Simulated Email Envelope**: Subject, From, Reply-To (`maevelleBangladesh@gmail.com`), and To fields.
  - **Data Source Selector**: Preview against deterministic sample fixtures (`multi-item`, `simple-cod`, `discounted`, `large-order`, `cancelled`, `refunded`) or against authentic order data by searching any Order ID/Number.
  - **Zero Side-Effects Guarantee**: Displays prominent "PREVIEW ONLY · NO EMAIL SENT" banner; guaranteed never to trigger external API calls or database notifications.

### 4. Test Email Lab (`/email?tab=test-lab`)
- **Safe Testing Workbench**: Allows operators and developers to verify email rendering and end-to-end delivery without touching production customer mailboxes.
- **Production Safeguards**: In non-production environments, dispatches are strictly restricted to allow-listed test recipients (`EMAIL_ALLOWED_TEST_RECIPIENTS`). Production test sends to unverified addresses are blocked.
- **Source Selection**: Test dispatches can render deterministic fixtures or authentic order snapshots.
- **Audit Logging**: Every test dispatch records the operator ID, reason, and timestamp in `platform.audit_log`.

### 5. Event Policies Matrix (`/email?tab=policies`)
- **Configurable Runtime Policies**: Manage policies for `ORDER_PLACED`, `ORDER_CONFIRMED`, `PAYMENT_VERIFIED`, `ORDER_DISPATCHED`, `DELIVERY_COMPLETED`, `ORDER_CANCELLED`, and `REFUND_COMPLETED`.
- **Three-Tier Policy Toggles**:
  - **Email Enabled**: Master toggle for whether emails exist for this business event.
  - **Automatic Send**: Whether canonical events automatically enqueue customer emails.
  - **Manual Send Allowed**: Whether operators can manually trigger this email from Order detail.
- **Eligibility Hierarchy Breakdown**: Visual decision tree explaining how global config, event policy, customer email availability, and suppression determine actual send eligibility.
- **Audited Updates**: Changing any policy requires a mandatory operational rationale and is written to the platform audit log.

### 6. Recipient Suppressions (`/email?tab=suppressions`)
- **Reputation Protection**: Lists all blocked email addresses with suppression reasons (`HARD_BOUNCE`, `COMPLAINT`, `ADMINISTRATOR`, `PROVIDER`).
- **Suppression Details**: Explains the root cause (e.g., permanent recipient server rejection vs spam complaint) and operational impact.
- **Manual Block & Audited Clear**: Authorized staff can manually block a recipient or clear a bounce suppression after address verification. Clearing a spam complaint requires elevated administrative confirmation and mandatory justification.

### 7. Diagnostics & Setup Checklist (`/email?tab=diagnostics`)
- **External Setup Checklist**: Clear tracking of Resend API key, From address, Reply-To support mailbox, Webhook signing secret, DNS records in Namecheap, and worker activity.
- **Zero Secret Exposure**: Only reports `Configured` or `Missing`—never displays raw API tokens or keys.
- **Documentation Integration**: Direct links to Resend Setup Guide, DNS Configuration, and Troubleshooting Runbooks.

---

## Order Detail Integration (`/orders/[id]`)

The Order Detail page features a dedicated **Customer Communications / Email** section:

1. **Expected Lifecycle Matrix**: Shows all canonical order events (`Order Received`, `Order Confirmed`, `Payment Confirmed`, `Order Dispatched`, `Order Delivered`, `Order Cancelled`, `Refund Completed`).
2. **Server-Calculated Eligibility**: Plainly explains why an email has or has not triggered (e.g. "Order has not reached dispatched status yet", "Automatic sending disabled by policy", or "Customer placed order without an email address").
3. **Interactive Actions**:
   - **Preview**: Real-time rendering of that specific order's template without sending.
   - **Send Email**: Manual send button with pre-send confirmation modal showing recipient, template, and mandatory reason.
   - **Retry**: Re-queues the same logical email after technical failure; shows failure code, attempt count, and confirmation modal.
   - **Resend**: Dispatches an explicit new customer copy linked to the original notification with full audit history.
   - **Timeline Drawer**: Opens slide-out drawer showing chronological delivery timeline, worker attempts, and provider message IDs.
4. **Live Polling**: When any notification is in `QUEUED`, `PROCESSING`, or `SENT`, the section automatically polls every 4 seconds until terminal delivery confirmation is received from Resend webhooks.

---

## Customer Detail Integration (`/customers/[id]`)

The Customer Detail page includes a dedicated **Customer Communications / Email** module:

1. **Deliverability Usability Indicator**:
   - **Usable**: Emerald badge indicating primary mailbox is healthy and ready for automated receipts and updates.
   - **Suppressed**: Red badge indicating the recipient is blocked due to bounce or complaint, with a quick link to manage the suppression.
   - **Missing**: Informative state indicating customer has no email on file (phone-only checkout).
2. **Transactional Dispatch History**: Lists all emails sent for orders placed by this customer with delivery status, date, and quick link to inspect the full timeline.

---

## Delivery Status Language

| Status | Meaning |
|---|---|
| **Queued** | Maevelle recorded the notification; background worker has not claimed it yet. |
| **Processing** | Email delivery worker has claimed the record and is contacting Resend. |
| **Sent / Accepted** | Resend accepted the message for delivery. Awaiting recipient mail server response. |
| **Delivered** | Recipient mail server reported successful delivery. |
| **Delivery Delayed** | Recipient server temporarily deferred message (greylisting/mailbox busy); will retry. |
| **Failed** | Technical failure (network timeout, rate limit) or provider rejection. |
| **Bounced** | Recipient mailbox does not exist or domain is invalid (permanent rejection). |
| **Complained** | Recipient marked email as spam. Address automatically suppressed. |
| **Suppressed** | Maevelle intentionally blocked delivery to preserve domain reputation. |
| **Skipped (No Email)** | Customer placed order without email; order progresses without error. |
| **Pending Manual** | Automatic delivery disabled by policy; operator can manually send if needed. |
| **Not Applicable** | Order state has not reached the requirement for this event. |

---

## Retry vs. Resend Distinction

- **Retry**: Used when a technical error occurs during transmission (e.g. transient provider timeout). Re-queues the exact same notification record and preserves the original delivery attempt history.
- **Resend**: Used when an operator intentionally wants to send another copy of an already delivered email to the customer. Creates a distinct new delivery record linked to the parent notification, ensuring full audit accountability.
