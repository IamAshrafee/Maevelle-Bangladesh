# Phase 01-C integrated audit

The supported guest flow crosses PDP, header and Cart page → shared controller, journal and same-origin adapter → Fastify route protection and strict shopper/capability resolution → scoped PostgreSQL mutations and evaluated views. Catalog, Pricing, Promotions and Inventory own evaluation. Checkout resolves Cart authority independently.

| Source boundary | Verified design |
| --- | --- |
| Storefront Cart feature and PDP | One confirmed projection, exact pending intent, owner epochs, bounded Web Locks and one browser runtime. |
| API app and Cart routes | Configured tenant/currency, strict shopper realm, exact Origin and Fetch Metadata, bounded rate limit and safe envelopes. |
| Database Cart and migrations 3213–3215 | Scoped row lock, revision checks, atomic receipt/outbox, separate current projection and immutable outcome. |
| Deployment strategy and migration reports | Local migration and restore evidence. Persistent continuity, proxy, roles and representative load remain release gates. |

The master spec, architecture, domain model, threat and scenario registers and roadmap contain full-product proposals. Current source supports exact variant Add, atomic Clear and cookie forgetting. Earlier reports that omit Clear or frontend recovery describe earlier checkpoints. Account merge, advanced line replacement, analytics and complete Checkout remain future contracts. Phase 01A.1 intentionally retired pre-cutover credentials. The [contract matrix](PHASE_01C_CONTRACT_VERIFICATION.md) records the implemented behavior. Three reproduced defects were closed within the existing architecture. See [security verification](PHASE_01C_SECURITY_VERIFICATION.md).
