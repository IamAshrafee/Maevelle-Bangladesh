# Resend and Namecheap Setup Guide

This work is external to the codebase and must be completed before production email can send.

1. Create or sign in to the Maevelle Resend account and use the correct team/project.
2. In Resend, add the Maevelle-controlled sending domain. Prefer a sending subdomain if Resend recommends one for the account.
3. Open Namecheap, choose the domain, and open **Advanced DNS**.
4. Copy every DNS record exactly as Resend displays it. Do not invent host names, values, priorities, or TTLs.
5. SPF tells receiving services which provider may send for the domain. DKIM adds a cryptographic signature proving the message is authorized. DMARC tells receivers what to do when authentication fails and provides reporting. Resend enforces its required SPF and DKIM records; DMARC is strongly recommended.
6. Wait for DNS propagation, then use Resend's domain page to check verification. Do not proceed until the domain shows verified.
7. Choose a From identity such as `Maevelle <orders@verified-domain>`. The address does not need to be a human inbox, but its domain must be verified.
8. Keep Reply-To configured as `maevelleBangladesh@gmail.com` so customer replies reach the support team.
9. Create a production Resend API key scoped for sending. Put it only in the API/worker deployment secret manager as `RESEND_API_KEY`. Never put it in Admin settings, browser environment variables, source control, screenshots, or chat.
10. In Resend Webhooks, create an endpoint at `https://YOUR_API_HOST/webhooks/resend`.
11. Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`. Open/click events are optional and not used as delivery truth.
12. Copy the webhook signing secret to the API deployment as `RESEND_WEBHOOK_SECRET`. Do not expose it to the browser.
13. Configure:

```text
EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
EMAIL_ENVIRONMENT=production
EMAIL_FROM_NAME=Maevelle
EMAIL_FROM_ADDRESS=orders@YOUR_VERIFIED_DOMAIN
EMAIL_REPLY_TO=maevelleBangladesh@gmail.com
STOREFRONT_BASE_URL=https://YOUR_STOREFRONT_HOST
RESEND_API_KEY=deployment-secret
RESEND_WEBHOOK_SECRET=deployment-secret
```

Production startup rejects a test-recipient override and rejects missing Resend secrets when sending is enabled.

## Safe verification

1. Deploy or restart API and worker.
2. Open **Email operations** and confirm provider configured, webhook configured, environment production, and the expected non-secret From/Reply-To values.
3. Preview Order Confirmation with a real test order.
4. Queue one authorized test/manual email to a controlled address.
5. Confirm the notification receives a Resend message ID, reaches the mailbox, and later becomes Delivered.
6. Reply from the mailbox and confirm Gmail receives it.
7. Confirm Resend shows successful webhook delivery and Maevelle's timeline contains the provider event.
8. Test one known Resend test scenario if available to the account, then verify failure/suppression visibility without using a real customer.

Production is not ready until DNS verification, secret configuration, webhook delivery, a real mailbox delivery, and Reply-To behavior have all been checked.

