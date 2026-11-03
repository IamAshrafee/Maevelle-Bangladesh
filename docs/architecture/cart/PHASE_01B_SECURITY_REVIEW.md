# Phase01B frontend security review

2026-11-02. This is source review and focused synthetic acceptance, not penetration-test/WCAG certification.

| Threats | Implemented boundary and evidence |
| --- | --- |
| T01/T14 tenant substitution, mass assignment | API adapter sends only existing schema; actual API rejects extra organization/price fields and foreign public context. Server code/security configuration unchanged. |
| T02 account switch | Auth begin clears display/epochs before auth request; settled checks shopper session; old responses ignored. ACCOUNT_CART_NOT_READY never triggers anonymous initialization. Unit and actual shopper browser cases. |
| T03 CSRF/origin | Existing same-origin wrapper, credentials policy and backend exact origin remain unchanged. Loopback proxy preserves actual browser Origin; no CORS/cookie-security changes for tests. No new full origin penetration suite claimed. |
| T04/T05 fixation/disclosure | HttpOnly slot credentials never accessed by JS. Actual Chrome cookies remain HttpOnly; document.cookie contains no guest slot. Public selectors require server cookie validation. Legacy fixed-cookie boundary remains **High/open**, backend closure required. |
| T07/T08 money | No frontend pricing/discount authority; no new promotion engine. Removed fabricated Cart delivery amount and tax-inclusive copy; displayed merchandise totals use authoritative DTO. |
| T09/T19 resource abuse | Single-flight reads/init, serialized writes, bounded dedupe/trailing hint refresh, visible-only30s polling and15s request timeout. Existing backend rate limits retained; repeated local runs observed real limiting, not bypassed. |
| T10/T11 replay/races | Immutable submitted intent and exact-key retry; controlled browser lost-after-commit/late-cookie ordering plus factory tests. No fresh-key retry of unknown outcomes. |
| T12 XSS | React text rendering; no new unsafe HTML insertion in application. Context options show bag index instead of raw credentials; stored commands reconstruct whitelisted fields. |
| T16 cache/privacy | No private SSR singleton or full Cart storage. Cart requests use no-store; real response Cache-Control private,no-store. No public initial Cart payload injected by layout. |
| T21/T23/T26 logs/tracking/secrets | No new analytics/provider integration. Channels/storage contain nonsecret bounded recovery/context hints only. Acceptance fixture credentials stay mode0600 in /tmp, never in checked-in results; HTTP logs exclude cookie values. |
| T30 Checkout compatibility | Existing DTO and routes retained, existing Checkout implementation untouched; rejected/uncertain Buy Now no longer navigates forward. Full signed-in legacy compatibility remains inherited open gate. |

## Residual gates

- Phase01A High legacy cookie adoption/retirement and fixation-parity risk remains unresolved; not repairable by trusting client storage or public IDs.
- Account Cart remains unsupported by authoritative backend. No merge, account UI, credential deletion or adoption implemented.
- Atomic Clear has no server contract; local unsupported rejection only. Future integration must be atomic/replay-safe, not a delete loop.
- Chrome-only browser evidence; no claim for Safari/Firefox/BFCache under every browser policy. Manual assistive-technology review and the CSS-zoom header overflow remain open.
- Existing unapproved business policies and Meta documentation limitation remain in their source-backed later gates; no Pixel/CAPI behavior implemented or asserted.
