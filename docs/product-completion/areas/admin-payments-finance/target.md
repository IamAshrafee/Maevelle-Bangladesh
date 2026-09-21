# Payments & Finance Target

The finished Admin area is organized around merchant destinations:

- Payments: verification queue, COD collection queue, confirmed payments,
  refunds, and payment-method configuration, with strong detail views.
- Finance: overview, financial activity, accounts, expenses, and balance checks.
- Contextual Supply, Order, Return, Delivery, Customer, and Account links rather
  than duplicating those workflows inside Finance.

All monetary summaries come from bounded server-side read models. Every
balance-affecting command is tenant-scoped, validated, transactional,
idempotent where retries can duplicate money, audited, and represented by an
immutable fact or explicit reversal/correction.
