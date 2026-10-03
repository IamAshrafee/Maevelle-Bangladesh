# How to Add an SMS Provider to Maevelle

1. Obtain current official API/callback documentation, credentials, sender approval facts, sandbox access, rate limits, and commercial terms.
2. Create `providers/<provider>/adapter`, `client`, `config`, `mapper`, and `webhook` modules in the infrastructure boundary.
3. Validate provider-specific environment/secrets without returning secret values to Admin.
4. Implement `SmsProvider.send`, mapping Maevelle's E.164 recipient, rendered text, sender preference, and stable idempotency key.
5. Validate every provider response and extract the provider message ID.
6. Normalize failures into transient, rate-limited, permanent, configuration, or unknown-outcome results.
7. Declare only capabilities actually supported and verified.
8. If callbacks exist, implement authentication before parsing, generate a stable provider event ID, and map statuses to Maevelle lifecycle states.
9. If status lookup exists, implement `getMessageStatus`; use it to reconcile accepted/delayed/unknown outcomes.
10. If supported, implement optional balance and provider-reported segment/cost facts.
11. Register the adapter in API/worker composition roots; do not import it from Orders, Delivery, Payments, or generic notification domain code.
12. Run the reusable provider contract suite plus request-mapping, response-validation, auth/config, Unicode, timeout, idempotency, callback replay, and out-of-order tests.
13. Configure deployment secrets and sender. Keep `SMS_ENABLED=false` initially.
14. Send allow-listed sandbox/development tests, then a controlled production test to owner-approved numbers.
15. Verify provider acceptance, handset delivery, delivery reports/polling, provider support lookup, and cost/segment reporting.
16. Enable individual automatic event policies gradually; monitor backlog, unknown outcomes, failures, and spend.

No business domain, generic notification table, worker lifecycle, Admin activity view, or template architecture should change for a normal adapter integration.
