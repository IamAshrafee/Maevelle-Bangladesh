# How Maevelle Email Notifications Work

Maevelle treats email as an operational delivery channel, not as order truth.

```mermaid
flowchart LR
  A[Order or payment change] --> B[Transactional outbox]
  B --> C[Notification policy]
  C --> D[Notification record]
  D --> E[Worker]
  E --> F[Resend]
  F --> G[Customer mailbox]
  F --> H[Signed webhook]
  H --> I[Delivery timeline in Admin]
  G -->|Reply| J[maevelleBangladesh@gmail.com]
```

Resend is the automated delivery provider. Gmail is the human support mailbox and is not used as Maevelle's sending engine. An order can succeed while email is delayed or failed because the worker sends only after the business transaction commits.

## Status language

- **Queued**: Maevelle recorded the email and the worker has not submitted it yet.
- **Processing**: one worker has claimed it.
- **Sent**: Resend accepted the message. This is not proof of mailbox delivery.
- **Delivered**: Resend reported successful delivery.
- **Delivery delayed**: the receiving system temporarily deferred it.
- **Failed**: a technical or permanent provider failure needs retry or review.
- **Bounced**: the recipient server permanently rejected it.
- **Complained**: the recipient reported it as spam.
- **Suppressed**: Maevelle or Resend intentionally prevented sending.
- **Skipped no email**: the order snapshot contained no email address.
- **Pending manual**: the event was recorded but automatic sending was disabled.

Automatic policy controls decide whether a canonical business event queues an email. Authorized staff can send an eligible template manually. **Retry** reuses the same logical email and provider idempotency key after technical failure. **Resend** creates a new, explicit, audited copy.

Use **Admin → Email operations** to inspect diagnostics, templates, policies, recent lifecycle state, suppressions and retries. Preview never sends. Development test recipients must be deployment-allow-listed and are visibly labeled.

See [Admin guide](admin-guide.md), [Resend setup](resend-setup-guide.md), [developer guide](developer-guide.md), and [troubleshooting](troubleshooting.md).

