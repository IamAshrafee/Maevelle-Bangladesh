# Current Focus

## Active area

Storefront Experience — Production Design System / Visual Foundation.

## Evidence state

`DESIGN_SYSTEM_LOCAL_VERIFICATION_COMPLETE / OWNER_REVIEW_PENDING`

Task 02 is locally implemented above architecture checkpoint `32d1152`. The Storefront now has one semantic Tailwind v4 visual language, intentional Latin/editorial/Bengali typography, mobile-first layout rules, restrained shape/elevation/motion, accessible server-compatible primitives, contrast protection, a permanent noindex `/design-system` reference, lower-cascade legacy quarantine, and a canonical design-system contract.

The approved UI/UX artifact and prior Storefront `DESIGN.md` described by the task were not present in the repository. `#7E0E35` is the implemented/recommended primary and `#9E2A4B` is a supporting rose; owner visual confirmation remains explicitly required.

## Verification completed

- Storefront TypeScript passed.
- 11 focused token/contrast tests passed.
- Focused ESLint passed.
- Storefront production build passed.
- Architecture check, secret scan, and `git diff --check` passed.
- Development browser smoke at 390 px and 1440 px confirmed 16/24 px gutters, 1240 px desktop container, no horizontal overflow, 48 px default controls, correct computed Plus Jakarta/Playfair/Noto Bengali stacks, and visible skip-link focus.

The Docker stack was running, but its Storefront image was not rebuilt; browser evidence came from the current development server. Owner/design-team visual judgment remains a separate gate.

## Next action

Compare `/design-system` with the approved UI/UX artifact when available and decide `OWNER_DECISION_REQUIRED — STOREFRONT_PRIMARY_BERRY`:

- Option A/recommended/current: `#7E0E35`.
- Option B: `#9E2A4B`, replacing—not duplicating—the semantic primary.

Then begin the production Global Shell/Header/Footer task, followed by Homepage, Catalog/Search, PDP, Cart, Checkout, Order tracking, and Reviews as distinct page/workflow tasks. The Task 02 foundation does not make those screens visually complete.
