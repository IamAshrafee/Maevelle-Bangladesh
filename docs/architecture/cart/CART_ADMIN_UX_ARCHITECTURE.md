# Admin Cart UX architecture

Existing navigation has Commerce → Orders and separate Analytics; reusable audit E44 and existing Analytics toolbar/report views are the integration points. Proposed Cart operations are a contextual `/orders/carts` workspace within Commerce/Orders, not another top-level menu. Add Cart analytics tab to current Analytics alongside Wishlist; reuse date presets, org scope, currency filters, report loaders, server pagination and URL filter state. Display `/admin/orders/carts` externally respecting Admin base path.

## Operator surfaces

| Section | Content / interpretation | Access |
| --- | --- | --- |
| Overview | ACTIVE/inactive count, guest/account counts, as-of current priced intent vs eligible value, activity trend, API and Worker health | carts.view aggregate operations |
| Analytics | Successful incremental adds/removes/deltas, quantity/value distributions, tenant currency and consent-aware segmentation; no sales/purchase inference | analytics.view existing + carts.analytics.view proposed |
| Product Insights | Variant/product most added, removals, validation stock friction, score/source; counts distinct intents and units separately | analytics.view + carts.analytics.view |
| Exceptions | Redacted merge/version/validation/session failures, unusual creation/rate patterns, dead-letter/cleanup health | carts.diagnostics.view; no raw shopper content |
| Configuration | Quantity/line limits within hard ceilings, inactivity retention within approved bounds, Cart enablement, recommendation enablement and policy version | carts.settings.manage; version + change reason |
| Diagnostics/Audit | Correlation trace, safe intent receipt metadata, lease/lag status, configuration audit; authorized redrive of exact safe job | carts.diagnostics.view and separate carts.jobs.retry for redrive |

Above are proposed capabilities; none is claimed present. Add explicit definitions/grants through forward migration and existing IAM semantic permission service; Owner receives deliberate grants, presets reviewed. `orders.view` and authentication alone do not grant Cart data. Cart shopper resolver never authorizes Admin, Admin resolver never grants shopper ownership. Scope API queries to active organization; capability-check before fetching, including exports. Analytics view without Cart analytics grant cannot fetch restricted Cart drilldowns.

No default raw customer-cart explorer, edit/delete impersonation, guest-token recovery or marketing export. If a diagnosed support need later requires private inspection, introduce separate `carts.private.inspect` high-sensitivity grant, explicit reason, minimal redacted read, expiry and audit; this is a designed exceptional permission, not enabled ordinary management. No arbitrary Cart mutations by staff. Customer contact info never needed for standard metrics. Small cohorts use privacy suppression (proposed <5), aggregate ownership segments only, no marketing identity joins.

## UI composition and states

Thin route → `AdminPage`, `PageHeader`/Title/Description/Actions → scoped tabs and shared filters → `PageSection`/`PagePanel`, KPI cards, existing charts, server-paginated `Table`. Reuse Button/Input/NativeSelect/Textarea, StatusBadge, Error/Empty/LoadingState and shared dialogs; search existing Analytics/Orders components before adding. Inter, semantic colors, tabular-nums font-mono numbers/dates/IDs, dense finance-style tables when suitable, no raw CSS/transition-all/global selectors. Dark/light and `/admin/design-system` are acceptance gates.

Mobile uses vertically stacked metric panels, scrollable explicit tabs, compact filters in sheet, row details in full-height overlay; tablet supports touch and rotated layouts; desktop table with bounded columns. Preserve essential counts/actions at 320px and 200% zoom. All config create/edit uses same shared fields/schema, prefilled current values and expected policy version. Floating dialogs manage focus, Escape and return; long configuration uses focused page/sheet as needed.

States: loading skeleton; true empty with date/filter explanation; stale/as-of after projector lag; retryable error preserving filters; unauthorized no-fetch denial; config conflict reload/review; partial diagnostic redrive with exact status; worker unavailable distinct from zero failures. No fake zeros for failed reports. Exports bounded/server-paginated, permission-checked, signed short-lived retrieval with audit if implemented.

## Settings and audit invariants

Security controls are code-level immutable: owner checks, exact origin, HttpOnly/Secure cookies, receipt replay binding, body hard limits and minimum abuse protection cannot be disabled by ordinary settings. Allow lower business quantity caps 1..99/line and 1..100 lines, never unlimited. Retention changes versioned with approved minimum/maximum and clear prospective impact, no hidden immediate destructive purge. Disabled Cart stops mutations with truthful recovery while permitting safe read/remove policy; never disables abuse checks or deletes saved intent.

Audit action, actor/membership, organization, reason, prior/new safe diff, policy version, timestamp, correlation ID for settings, sensitive diagnostic access, exports and redrive. Do not log Cart contents/tokens or customer PII. Cross-org denial and settings validation are backend requirements, independent of hidden frontend navigation.

Acceptance: S45–S48, T15/T20/T21/T25; actual backend grant/denial browser tests, stale filter request ordering, org switch, date/timezone/currency correctness, 320px/tablet/desktop and dark mode. Future checkout conversion metrics display unavailable until authoritative Checkout events exist, not zero or a fabricated Cart conversion rate.
