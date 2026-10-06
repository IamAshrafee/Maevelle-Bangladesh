# Maevelle Storefront Design System

This is the canonical production visual-system reference for `apps/storefront`. The runtime source of truth is `apps/storefront/styles/theme.css`; this document explains intent and usage. It replaces informal MVP styling as a source of visual decisions.

The system is light-theme only, mobile-first, warm, restrained, product-focused, and intentionally distinct from the Admin Portal. Future page designs may extend it through demonstrated patterns, but must not create a parallel token set.

## Source-of-truth reconciliation

The approved UI/UX design system artifacts were provided via `Stitch/DESIGN (1).md` and the Stitch UI vaults (`stitch_maevelle_mobile_design_system (1, 3, 7, 8)`). These reconcile the token and component definitions into production-grade foundations.

| Token or rule | Conflicting/current values | Approved artifact value | Canonical value | Resolution |
| --- | --- | --- | --- | --- |
| Primary | Brief structured `#7E0E35`; prose `#9E2A4B`; MVP `#8C3248` | `#7E0E35` (Primary Pressed / Brand Anchor), `#9E2A4B` (Primary CTA Container) | `#7E0E35` (primary) / `#9E2A4B` (primary-container) | Canonical authority established. `#7E0E35` anchors brand identity and pressed states (7.2:1 AAA); `#9E2A4B` powers high-conversion primary CTAs (4.8:1 AA). |
| Primary hover | MVP `#682035` | `#65102E` | `#65102E` | Darkens primary without changing hue family. |
| Canvas & Surface | MVP `#FFFDF9` | `#FFF8F5` (Surface Alabaster) / `#FFFFFF` (Pristine Card Base) | `#FFF8F5` / `#FFFFFF` | Warm alabaster neutral prevents tropical screen glare while pristine white tiles elevate products. |
| Surface Containers | Unspecified in MVP | Lowest `#FFFFFF`, Low `#FAF2EE`, Mid `#F4ECE8`, High `#EEE7E3`, Highest `#E9E1DD` | Five-tier container scale | Provides structured architectural elevation for sheets, cards, inputs, and steppers. |
| Foreground / Ink | MVP `#211C1B` | `#1E1B19` (Espresso Ink) | `#1E1B19` | Warm near-black with 15.8:1 contrast on alabaster canvas. |
| Muted text | MVP `#6F6662` | `#574144` (Stone) | `#574144` | Readable at 9.0:1 on canvas. |
| Spacing | Scattered MVP values | 4, 8, 12, 16, 24, 32 px | 4 px base scale + Stitch spacing tokens | `space-xs 4`, `space-sm 8`, `space-md 12`, `space-lg 16`, `space-xl 24` px. |
| Radius | Inconsistent | `rounded-sm 4px`, `rounded-md 8px`, `rounded-xl 12px`, `rounded-2xl 16px`, `rounded-full 9999px` | Stitch 5-tier geometry | Standardized across micro badges, inputs, cards, drawers, and pills. |
| Elevation | Unnamed MVP shadows | Ambient blush diffusion `rgba(158, 42, 75, 0.04-0.08)` | `raised`, `floating`, `modal` | Warm diffused drop-shadows with blush tint. |
| Motion | Brief ranges only | `120/180/260ms` + `active:scale-98` | `120/180/260ms` with tactile press scaling | Tactile touch scaling for buttons, icon buttons, and chips. |
| Main container | Brief approx 1240 px | `390px` mobile baseline up to `1240px` desktop | `390px` to `1240px` | Strict mobile-first thumb ergonomics reflowing to 1240px desktop. |
| Typography | 3 variable families | Playfair Display + Plus Jakarta Sans + Noto Sans Bengali | Retained & unified | Playfair Display for editorial headlines, Plus Jakarta Sans for functional commerce, Noto Sans Bengali for Bangla scripts. |

## Color system

### Brand foundation

| Name | Value | Role |
| --- | --- | --- |
| Berry 950 | `#4A1027` | Deep brand/inverse detail |
| Berry 900 | `#65102E` | Primary hover |
| Berry 800 | `#7E0E35` | Canonical primary |
| Berry 700 | `#9E2A4B` | Supporting rose/container tone |
| Rose 200 | `#E8C9D2` | Strong blush divider/selection |
| Blush | `#F8E8ED` | Brand-subtle surface |
| Linen | `#F7F0EA` | Muted warm surface |
| Warm white | `#FFFAF7` | Page canvas |
| Espresso | `#291C20` | Primary text/inverse surface |
| Stone | `#665B5E` | Muted text |

Application code should use semantic utilities (`bg-background`, `bg-surface`, `text-foreground-muted`, `border-border`, `bg-primary`) instead of raw palette utilities. Brand tokens are for the lab and exceptional brand artwork.

Status colors are separate from the berry brand: green success, amber warning, red danger, and blue information. Every status component pairs color with text and/or semantics.

### Critical contrast evidence

Ratios are calculated by `apps/storefront/lib/design-system/theme.test.ts` and must remain at least WCAG AA 4.5:1 for normal text.

| Pair | Ratio |
| --- | ---: |
| Foreground / canvas | 15.82:1 |
| Muted foreground / canvas | 6.29:1 |
| Subtle foreground / canvas | 4.91:1 |
| White / primary | 10.49:1 |
| Success text / success subtle | 9.27:1 |
| Warning text / warning subtle | 9.08:1 |
| Danger text / danger subtle | 8.97:1 |
| Information text / information subtle | 8.43:1 |

## Typography

- Plus Jakarta Sans is the functional Latin UI face for navigation, products, prices, forms, checkout, and feedback.
- Playfair Display is limited to selective campaign/editorial display and large editorial headings. It is not for controls, prices, option labels, filters, or dense UI.
- Noto Sans Bengali is the explicit Bangla face. `:lang(bn)` raises line-height to 1.72 and prevents Playfair inheritance. Mark Bangla content with `lang="bn"`.
- The three families remain self-hosted by `next/font` with `display: swap`; no runtime Google Fonts requests or new font family were added.
- Display and large headings are fluid; functional body, label, caption, and price roles are deliberately few. Use `Heading`/`Text` or `text-display`, `text-heading-*`, `text-body-*`, `text-label`, and `text-caption`.
- Prices use the shared `Money`/`Price` primitives and `tabular-nums`. Formatting delegates to `Intl.NumberFormat`; pricing truth remains backend-owned.
- Inputs remain 16 px to avoid unwanted iOS Safari zoom. Use minimum heights, not fixed heights, so Bangla and 200% text zoom can grow safely.

## Spacing, layout, and responsive behavior

The normal component rhythm is the Tailwind 4 px base scale: 4, 8, 12, 16, 24, and 32 px. Functional UI should stay compact; editorial sections may use 48–96 px vertical spacing through the `Section` variants.

- `Container size="main"`: maximum 1240 px, 16 px mobile gutter, 24 px from `md` upward.
- `Container size="narrow"`: maximum 704 px for prose and focused workflows.
- Compact grid gap: 12 px. Increase only when a design demonstrates a need.
- Use Tailwind's standard mobile-first breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 px. Do not add device-specific or page-specific breakpoints.
- Universal product-grid starting recipe: 2 mobile, 3 tablet, 4 desktop columns with 3:4 media. Final ProductCard and Catalog behavior belong to their feature tasks.
- Use `svh`/`dvh` for full-height mobile UI and `env(safe-area-inset-*)` for future sticky bars/sheets.

## Shape, borders, and elevation

| Token | Value | Intended use |
| --- | ---: | --- |
| `rounded-sm` | 4 px | Micro controls and utility details |
| `rounded-md` | 8 px | Buttons, inputs, media, standard controls |
| `rounded-lg` | 12 px | Cards and grouped surfaces |
| `rounded-xl` | 16 px | Drawers and larger surfaces |
| `rounded-2xl` | 24 px | Rare editorial/special surfaces |
| `rounded-full` | Pill/circle | Badges, choice pills, circular controls |

Use `border-border-subtle`, `border-border`, or `border-border-strong`; avoid black borders. Flat, border-led surfaces are the default. `shadow-raised` is for a small number of elevated cards, `shadow-floating` for dropdowns/floating chrome, and `shadow-modal` for modal surfaces. Product grids must not apply large shadows to every card.

Glass is allowed only for sticky global chrome, a sticky mobile purchase bar, or an approved floating overlay. `Surface variant="glass"` provides an opaque fallback and enables restrained blur only through feature detection. Never use glass on product grids, dense lists, or forms.

## Motion and interaction

- Fast: 120 ms; normal: 180 ms; surface: 260 ms; easing: `ease-maevelle` (`cubic-bezier(0.2, 0, 0, 1)`).
- Animate opacity and transform when possible. Color/border transitions are acceptable for controls. Never use `transition-all`.
- Base CSS reduces animations and transitions under `prefers-reduced-motion` without removing state communication.
- Default important controls are 48 px high/effective size. `Button size="sm"` is 40 px and is limited to dense secondary desktop contexts; mobile conversion actions use `md` or `lg`.
- Hover enhances but never carries meaning. Pressed, selected, disabled, loading, error, and focus states remain independently visible.
- One focus-visible system uses the berry focus ring with a 3 px offset. Do not remove it without an equivalent visible replacement.

## Foundational component contract

| Component | Purpose and important behavior |
| --- | --- |
| `Button` | `primary`, `secondary`, `outline`, `ghost`, `danger`; `sm/md/lg`; native props/ref path; loading sets `aria-busy` and disables repeat submission. Icons compose as children. |
| `IconButton` | Circular 48/52 px control; accessible `aria-label` is required by TypeScript. |
| `Badge` | Compact semantic status/brand label; neutral, brand, success, warning, danger, info. |
| `Chip` / `ChoiceChip` | Display metadata vs. interactive `aria-pressed` choice; unavailable choices are not conveyed through opacity alone. |
| `ColorSwatch` | Named, focusable, selected/unavailable states with a 48 px target. Dynamic product color is the only justified inline style. |
| `Input` | Luxury text input with forwardRef; `sm/md/lg` size variants (36px, 44px, 48px); `leftIcon` and `rightIcon` slots; `clearable` button; `showPasswordToggle` reveal; error states with primary/error focus rings. |
| `Select` | Custom luxury select primitive with `sm/md/lg` sizes; styled `ChevronDownIcon`; `leftIcon` slot; error states; `appearance-none` with touch-friendly hitboxes. |
| `Textarea` | Multi-line input with `min-h-24/28`, live character counter (`showCharacterCount`), `maxCharacters`, and error states. |
| `Field` | Stable ID form wrapper wiring labels, required asterisk, optional indicators, helper text, and error states with `AlertCircleIcon`. |
| `Checkbox`, `Radio` | Custom luxury checkboxes and radios with rounded-[5px] and circular frames, animated checkmarks and inner dots, peer-focus rings, labels, and descriptions. |
| `RadioCard` | Interactive checkout tile for delivery and payment selection (e.g. 24h Express vs Standard; bKash vs COD) with radio check, badges, price tags, and hover/active transitions. |
| `Container`, `Section` | Enforce shared gutters, maximum widths, and functional/editorial vertical rhythm. |
| `Surface` | 3-tier elevation system (`flat`, `raised`, `floating`) plus liquid frosted glass, sunken wells, and optional interactive hover/touch scaling. |
| `Notice` | 6 luxury semantic variants (`brand`, `success`, `warning`, `danger`, `info`, `neutral`) with default icons, dismiss control, and call-to-action buttons. |
| `Skeleton`, `Spinner` | Warm neutral surface shimmers with presets (`text`, `circular`, `card`, `button`); multi-size editorial spinners (`xs/sm/md/lg`) in brand primary and neutral. |
| `Separator`, `VisuallyHidden`, `SkipLink` | Hairline dividers with horizontal/vertical orientation and optional centered labels; accessibility skip link with primary luxury styling. |
| `Heading`, `Text`, `Kicker` | Playfair Display editorial serif display headings, Plus Jakarta Sans clean UI text, and uppercase letterspaced kicker labels. |
| `Money`, `Price` | Formatted Taka (`৳`) currency figures with tabular numerals, comparison strikethroughs, and sale badges. |
| `SortDrawer` | 1:1 Stitch bottom-sheet drawer with auto-select, editorial Playfair heading, crisp berry radio checkmarks, Trending pill, and single Reset button. |
| `CartDrawer` | Slide-up shopping bag sheet with free shipping progress bar (৳2,500 threshold), item steppers, subtotal, and dual checkout CTAs. |
| `ProductCard` | 3:4 portrait card with ATELIER DROP urgency badge, wishlist pop button, finish swatches, and inline Add to Bag. |
| `QuantityStepper` | Tactile `[-] count [+]` stepper with minimum 1 protection and `scale-90` tactile feedback. |
| `WishlistButton` | Animated heart toggle with tactile scale pop and accessibility labeling. |
| `PhoneInput` | Courier contact input with 🇧🇩 `+880` prefix chip, validation, and verified check indicator. |
| `Toggle` | Tactile iOS/Maevelle 1-tap checkout switch with smooth sliding thumb. |
| `BottomNav` | Mobile 4-tab bottom navigation with safe-area padding and active indicator. |
| `TrustBadges` | Maevelle White Glove Dispatch 3-pillar customer trust banner. |
| `FilterDrawer` | Multi-faceted bottom sheet drawer for collection refinement (price slider, palette swatches, material chips, Dhaka express toggles). |
| `FilterTriggerButton` | Ergonomic catalog bar trigger button with dynamic active criteria badge. |
| `AnnouncementBar` | High-visibility top marquee for Dhaka courier promise and promotions with dismiss control. |
| `MobileNavbar` | Viewport `< lg` header matching Stitch mobile design with brand logo, search expander drawer, and badged cart icon (no hamburger, no account). |
| `DesktopNavbar` | Viewport `lg+` 2-row luxury header with brand typography, prominent search bar, badged utilities, and an interactive category mega-menu. |
| `MobileFooter` | Viewport `< lg` minimal footer with compact brand header, quick utility links, local payment pills, and bottom-nav safe clearance. |
| `DesktopFooter` | Viewport `lg+` luxury noir footer with VIP atelier newsletter dispatch, 4-column atelier architecture, white glove trust standards, and verified payment badges. |
| `StorefrontFooter` | Master footer component automatically rendering `MobileFooter` on mobile/tablet and `DesktopFooter` on desktop. |


### Quarantined Legacy CSS Neutralization
To prevent legacy MVP styles (`styles/legacy.css`) from contaminating production components—specifically the legacy rule forcing buttons to 44px min-height, border radius, and dark hover—`styles/base.css` explicitly resets button `min-height: 0`, `min-width: 0`, `border-radius: 0`, and `button:hover:not(:disabled)`. All buttons, icon buttons, and circular controls now render with true geometric dimensions.

## CSS and component ownership

`app/globals.css` only imports Tailwind, tokens, quarantined legacy CSS, and base rules. `theme.css` is the sole runtime token source; `base.css` owns document defaults and accessibility behavior. New pages use semantic Tailwind utilities and shared primitives. They must not add page selectors to global CSS, static inline styles, raw hex colors, random shadows/radii, `transition-all`, or CSS-in-JS.

`styles/legacy.css` remains a temporary 3,300-line MVP quarantine. It is imported into Tailwind's low-priority base layer so production component utilities win. Its top-level aliases now map to production semantics. Do not add selectors; delete route-owned sections during each approved page redesign.

Static arbitrary Tailwind values are disallowed in normal product work. A rare platform expression such as safe-area math or the internal glass fallback is acceptable only when no named token can express it. Dynamic values such as a backend color swatch may use a narrowly scoped inline style.

Keep primitives Server Component compatible. Add `'use client'` only when browser state, events, or APIs require it. Avoid barrels on hot client paths and import component files directly.

### Shared Component Authority & Single Source of Truth
Every shared pattern (such as `QuantityStepper`, `Price`, `Money`, `SortDrawer`, `CartDrawer`, `Button`, `IconButton`, `Chip`, `Badge`, `PhoneInput`, `Toggle`, `ProductCard`) must have a single authoritative component implementation in `components/ui/`, `components/commerce/`, or `components/layout/`.
- **Never inline duplicate patterns:** Do not write inline one-off steppers, buttons, badges, chips, inputs, or cards inside drawers, modals, or pages.
- **Evolve the primitive:** If a design artifact (like Stitch) introduces a compact size or a specialized visual treatment (e.g., compact 28px in-cart stepper vs 36px PDP stepper, or mobile vs desktop card interactions), add that variant or size directly to the reusable component and consume it in the drawer/page.
- **Immediate propagation:** Updating the shared component guarantees consistent ergonomics, accessibility, keyboard navigation, and styling across all storefront surfaces simultaneously.

### Product Card Architecture (Mobile & Desktop)
Extracted faithfully from the Warm Editorial Atelier shop design (`Stitch/stitch_maevelle_mobile_first_design_system1`), replacing legacy card markup with a borderless, high-editorial aesthetic:
- **Hero Image Container:** 3:4 aspect ratio with `rounded-xl`, `bg-surface-container-low`, and subtle diffused shadow (`shadow-[0_4px_16px_rgba(26,22,23,0.04)]`).
- **Capsule Badges:** Frosted glass capsule badges (`Editor's Pick`, `New In`, `Best Seller`) and scarcity pills (`Low Stock (3 left)` in `bg-secondary-fixed text-on-secondary-fixed`).
- **Frosted Wishlist Button:** Floating 32px (`size-xs`) frosted glass circular button with tactile press scaling.
- **Floating Reassurance / Rating Pills:** "Dhaka 24-48h Delivery" with bolt icon and Star Rating pill (`★ 4.9 (34)`) directly anchored to the bottom of the artwork. On desktop, bottom pills smoothly fade out on image hover as the Quick Add bar slides up.
- **Sold Out State:** 30% desaturated image, dark veil overlay (`bg-inverse-surface/35 backdrop-blur-[1px]`), uppercase "Sold Out" tag, and interactive "Notify Me" action with bell icon.
- **Desktop Enhancements:** Slide-up frosted "Quick Add to Bag" action bar on pointer hover (`group-hover:translate-y-0 group-hover:opacity-100`), smooth secondary image crossfade, expanded multi-line title, subtitle specifications, and interactive finish swatch previews.

## Development lab and quality gate

The permanent lab is `/design-system` in every environment. It includes color, type, Bangla/mixed strings, Taka prices, buttons, badges, chips, swatches, forms, semantic feedback, surfaces, loading, and responsive layout. It remains `noindex`, `nofollow`, and excluded from the sitemap, but it must stay directly reachable so owners and future implementation tasks can inspect the shared visual language after every update.

Before extending the system, inspect the lab at mobile, tablet, and desktop widths and run:

```text
pnpm exec vitest run apps/storefront/lib/design-system/theme.test.ts
pnpm exec tsc --project apps/storefront/tsconfig.json --pretty false
pnpm exec eslint <changed storefront files>
pnpm --filter @maevelle/storefront build
pnpm check:architecture
pnpm check:secrets
git diff --check
```

Browser/owner review is a distinct gate. A passing build does not confirm visual agreement with a missing design artifact or real mobile hardware.
