# Commerce Orders & Customers Verification

Current evidence:

- Fresh development and test databases applied the full mutable migration
  baseline successfully.
- Focused Commerce and clean-migration verification: 32 tests passed across
  `customers.test.ts`, `orders.test.ts`, `commerce-foundation.test.ts`, and
  `migrate.test.ts`.
- Coverage includes checkout atomicity, last-unit concurrency, cancellation
  release, idempotency, manual creation, order notes and transitions, E.164
  customer identity, conservative reuse, duplicate contact rejection,
  cross-organization mutation isolation, and failed outbox retry state.
- New coverage includes canonical Customer merge and replay, current-profile
  anonymization with alias pseudonymization and retained evidence, atomic Order
  line cancellation with total/payment/reservation reconciliation, final-line
  protection, delivery-address correction evidence, and clean-baseline reruns.
- Database and API TypeScript builds passed.
- Admin production build passed and emitted `/orders`, `/orders/[id]`,
  `/orders/new`, `/customers`, `/customers/[id]`, and `/customers/new`.
- Focused ESLint passed for all touched domain, API, contract, test, and Admin
  files.
- The rebuilt Docker stack reported healthy Postgres, API, Admin, and
  Storefront services after applying the revised baseline.

Authenticated browser and responsive visual review remains pending; no known
implementation blocker remains.
