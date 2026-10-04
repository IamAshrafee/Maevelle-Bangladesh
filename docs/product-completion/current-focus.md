# Current Focus

## Active Area

Reviews Module — Production-Complete Storefront & Admin Experience.

## Current Status / Substage

`REVIEWS_FRONTEND_COMPLETION`

## Implementation Overview

Successfully completed the dedicated **Frontend-Completion Phase for Maevelle's Reviews module** (`BACKEND CAPABILITY → COMPLETE CUSTOMER / ADMIN EXPERIENCE`). The trust and reputation lifecycle is now fully realized across three major surfaces: the Customer Storefront Product Detail & dedicated submission flow, the Admin Review Management Command Center, and cross-domain integrations in Customer and Order Admin modules.

---

### Surface 1: Storefront Product Detail Reviews & Dedicated Submission UX

1. **Authoritative Product Rating Summary (`product-rating-summary.tsx`)**:
   - Replaced client-calculated mock ratings with authoritative backend aggregates from `reviews.product_rating_summaries`.
   - Score banner (e.g. `4.8 ★★★★★`), verified buyer count, and interactive 5-star distribution bar breakdown with percentage fills and click-to-filter toggles.
2. **Accessible Star Rating Component (`star-rating.tsx`)**:
   - Accessible SVG star rendering with precise fractional fills, keyboard navigation, touch support, and human rating equivalents ("5 - Excellent", etc.).
3. **Multi-Faceted Review Filters & Sorting (`review-filters.tsx`)**:
   - Filter chips for All, 5★ through 1★, With Photos/Videos, and Verified Buyers only.
   - Sort selector: `Newest first`, `Highest rating`, `Lowest rating`, `With photos`.
4. **Authentic Review Cards (`review-card.tsx`)**:
   - Safe customer author display name (e.g., `Nusrat J.`).
   - Subtle `✓ Verified Purchase` badge strictly tied to delivered order line verification.
   - Purchased variant context: `Purchased: Black / Medium`.
   - Progressive disclosure for long text (`Read more` / `Show less`).
   - Customer photo and video thumbnails with play badge indicators.
   - Prominent, visually distinct **"Response from Maevelle"** official merchant response container.
5. **Fullscreen Review Media Lightbox (`review-media-lightbox.tsx`)**:
   - Responsive modal with keyboard support (Escape, Left/Right arrows), thumbnail strip, and connected review context panel (stars, variant, text, author).
6. **Multi-Photo Drag-and-Drop Uploader (`review-media-uploader.tsx`)**:
   - Supports JPEG, PNG, WebP up to 5 MB per file.
   - Orchestrates secure upload sessions via `/api/reviews/media/uploads`, content streaming via `/api/reviews/media/uploads/:sessionId/content`, and safety processing polling via `/api/reviews/media/:assetId/status`.
7. **Complete Review Submission & Revision Form (`review-form.tsx`)**:
   - 1–5 star interactive selector, optional title, body textarea with live character counter, custom public display name for privacy, media attachments, and idempotency key protection.
   - Supports customer review revisions and withdrawal workflows via `/api/reviews/:id/withdraw`.
   - Clearly communicates moderation lifecycle: explains whether the review published immediately or is awaiting moderation.
8. **Dedicated Post-Delivery Review Page (`apps/storefront/app/reviews/submit/page.tsx`)**:
   - Accessible via SMS/email links with signed tokens.
   - Authoritatively validates eligibility via `GET /api/reviews/eligibility`.
   - Clear friendly error screens for `INVALID_TOKEN`, `EXPIRED_TOKEN`, `NOT_DELIVERED`, and `ALREADY_REVIEWED` with options to view or revise previous submissions.
9. **SEO Server-Rendering & JSON-LD Schema.org Integration (`apps/storefront/app/products/[handle]/page.tsx`)**:
   - Server-renders initial published reviews and rating aggregates.
   - Outputs authoritative Schema.org `AggregateRating` and `Review` JSON-LD structures matching visible storefront figures.

---

### Surface 2: Admin Review Management Workspace (`apps/admin/components/reviews/`)

1. **Queue KPI Stats Strip (`reviews-stats-strip.tsx`)**:
   - Live backend queue counts: `Awaiting Decision` (Pending), `Storefront Visible`, `Needs Response` (Unreplied), `With Media`, `Rejected`, and `Hidden Content`.
   - Interactive quick-filtering on click.
2. **Density-Aware Reviews Table (`reviews-table.tsx`)**:
   - Comfortable and compact views with `tabular-nums` for dates and rating.
   - Columns: Review snippet & rating, Product title & variant link, Customer profile link & order number link, Media badge, Status badges, and Maevelle reply status.
   - "Inspect" action button opening the deep inspection drawer.
3. **Deep Operational Inspection Drawer (`review-detail-drawer.tsx`)**:
   - Product context linked to `/products/[id]`.
   - Customer context linked to `/customers/[id]`.
   - Order context linked to `/orders/[id]` with fulfillment status, delivery outcome, and SKU snapshot.
   - **Return & Refund Warning Banners**: Alerts operators if the customer later initiated a Return Case or received a Refund Allocation.
   - Full review text, safe display name, and embedded media viewer (images with zoom, videos with HTML5 player).
   - Complete Revision History timeline with timestamps, rating, moderator attribution, and internal notes.
   - **Policy-Based Moderation Actions**: Gated by `reviews.moderate` capability.
     - `Approve & Publish`: Transitions review to Storefront visible and triggers projection update.
     - `Reject Revision`: Dedicated modal requiring standard policy violation reason (`SPAM`, `DUPLICATE`, `IRRELEVANT`, `ABUSIVE_OR_THREATENING`, etc.) and optional internal notes. Enforces invariant `REV-INV-025`: negative sentiment alone is strictly prohibited as a rejection ground.
     - `Hide from Storefront` / `Restore to Storefront`.
   - **Official Merchant Response Editor**: Gated by `reviews.respond` capability.
     - Textarea (up to 3000 chars) with live preview banner ("This will appear publicly on the Storefront as 'Response from Maevelle'").
4. **Integrity Diagnostic & Projection Repair Dialog (`rebuild-summary-dialog.tsx`)**:
   - Gated by `reviews.integrity` capability.
   - Executes `GET /api/admin/reviews/integrity` and `POST /api/admin/reviews/products/:productId/rebuild-rating-summary`.
5. **Unified Reviews Workspace (`reviews-workspace.tsx`)**:
   - Integrates stats strip, search with debounce, rating dropdown, sort order, density toggle, table, server-side pagination, and drawer.
   - Synchronizes queue, search, rating, sort, page, and selected review ID directly with URL search params.
   - Delegated from `ReviewsConsole` and wrapped in `Suspense` in `apps/admin/app/reviews/page.tsx`.

---

### Surface 3: Cross-Module Integrations (Customer & Order Admin)

1. **Customer Admin Reviews Tab (`apps/admin/components/customers/customer-orders-section.tsx`)**:
   - Tab counter reflects `metrics.totalSubmitted`.
   - Mini KPI strip displaying total submitted, approved, pending, and average rating given (`★ 4.8 / 5.0`).
   - For each review: Product title linked to `/products/[id]`, variant label, stars, review body snippet, moderation status badge, verified badge, and direct "Inspect in Reviews" button linking to `/reviews?id=[reviewId]`.
2. **Order Admin Review Lifecycle Card (`apps/admin/components/orders/order-review-status-card.tsx`)**:
   - Mounted inside `order-detail-console.tsx`.
   - Queries `GET /api/admin/orders/:orderId/review-state`.
   - Renders each order line item with variant, delivery outcome, eligibility status ("Eligible for Review", "Awaiting Delivery"), submitted rating, status badge, and direct link to inspect the review.

---

## Verification Evidence

- Monorepo Typecheck: `pnpm typecheck` (`tsc --build --pretty false`) passed with exit code 0 across all packages with `exactOptionalPropertyTypes: true`.
- Storefront Production Build: `pnpm --filter @maevelle/storefront build` completed with exit code 0 (`next build` compiled dynamic routes and static pages successfully).
- Admin Production Build: `pnpm --filter @maevelle/admin build` completed with exit code 0 (all 82 admin routes statically prerendered and optimized successfully).
