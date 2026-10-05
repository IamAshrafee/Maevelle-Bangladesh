# Maevelle Storefront Design System

This is the canonical production visual-system reference for `apps/storefront`. The runtime source of truth is `apps/storefront/styles/theme.css`; this document explains intent and usage. It replaces informal MVP styling as a source of visual decisions.

The system is light-theme only, mobile-first, warm, restrained, product-focused, and intentionally distinct from the Admin Portal. Future page designs may extend it through demonstrated patterns, but must not create a parallel token set.

## Source-of-truth reconciliation

No approved UI/UX artifact or prior Storefront `DESIGN.md` was present in the repository during Task 02. The task brief supplied the only production palette and geometry direction. Missing artwork is not treated as evidence.

| Token or rule | Conflicting/current values | Approved artifact value | Canonical value | Resolution |
| --- | --- | --- | --- | --- |
| Primary | Brief structured `#7E0E35`; prose `#9E2A4B`; MVP `#8C3248` | Not available | `#7E0E35` | Structured production token; stronger white-text contrast. `#9E2A4B` remains Berry Rose 700, not another primary. Owner visual confirmation remains required. |
| Primary hover | MVP `#682035` | Not available | `#65102E` | Darkens primary without changing hue family. |
| Canvas | MVP `#FFFDF9`; brief warm-white/linen direction | Not available | `#FFFAF7` | Warm enough to distinguish the canvas while keeping photography neutral. |
| Surface | MVP mixed white/paper | Not available | `#FFFFFF` | Gives clear hierarchy against the warm canvas. |
| Foreground | MVP `#211C1B`; brief espresso direction | Not available | `#291C20` | Warm near-black with 15.82:1 contrast on canvas. |
| Muted text | MVP `#6F6662` | Not available | `#665B5E` | Readable at 6.29:1 on canvas. |
| Spacing | Brief `4/8/12/16/24/32`; scattered MVP values | Not available | Tailwind 4 px base scale | Preserves the requested scale while allowing larger editorial spacing. |
| Radius | Brief prose used `rounded-md` for 8 px; structured scale names differed | Not available | `xs/sm 4`, `md 8`, `lg 12`, `xl 16`, `2xl 24` px | Components use `rounded-md` for the standard 8 px control radius. |
| Elevation | Unnamed MVP shadows | Not available | `raised`, `floating`, `modal` | Three warm, diffused levels; flat remains the default. |
| Motion | Brief ranges only | Not available | `120/180/260ms` | Fast controls, normal state changes, and surface movement respectively. |
| Main container | Brief approximately 1240 px | Not available | `77.5rem` / 1240 px | Exact shared maximum with 16 px mobile and 24 px desktop gutters. |
| Typography | Task 01 loaded 3 variable families | Not available | Plus Jakarta Sans, Playfair Display, Noto Sans Bengali | Retained; Playfair is editorial only and Bangla always uses Noto Sans Bengali. |

### Owner decision required

`OWNER_DECISION_REQUIRED — STOREFRONT_PRIMARY_BERRY`

- Option A: `#7E0E35` (implemented and recommended). Deeper, more premium, white contrast 10.49:1.
- Option B: `#9E2A4B`. Brighter/softer, white contrast 7.27:1, but it should replace the primary token rather than coexist as a second primary.
- Required review: compare the development lab with the missing approved design artifact. A later decision changes the semantic token only; component APIs remain stable.

This decision does not block page implementation because the codebase has one unambiguous runtime primary today.

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
| `Input`, `Textarea`, `Select` | Native elements, 48 px minimum controls, 16 px text, disabled/read-only/error states, and normal attribute forwarding. |
| `Field` | Requires a stable `id`; wires label, description, error, `aria-describedby`, and `aria-invalid` without client JavaScript. |
| `Checkbox`, `Radio` | Native semantics with a shared label hit area, keyboard behavior, and accent/focus treatment. |
| `Container`, `Section` | Enforce shared gutters, maximum widths, and functional/editorial vertical rhythm. |
| `Surface` | Flat/raised/floating/inverse/glass recipes with restrained geometry and elevation. |
| `Notice` | Neutral/success/warning/danger/info feedback with readable semantic pairs and live-region-compatible roles. |
| `Skeleton`, `Spinner` | Reduced-motion-aware loading foundations; spinner always exposes a status label. |
| `Separator`, `VisuallyHidden`, `SkipLink` | Semantic structure, accessible naming, and keyboard bypass. |
| `Heading`, `Text` | Small explicit typography API that preserves heading level independently from visual role. |
| `Money`, `Price` | `Intl` formatting, Taka support, sale/original presentation, and tabular figures without pricing calculations. |

Components deliberately not created: Switch, SegmentedControl, ToggleGroup, Dialog, Drawer, BottomSheet, Tooltip, Tabs, Accordion, Toast, Progress, and a final ProductCard. They should wait for an approved feature flow; native `<dialog>` and the existing implementations should be evaluated during the relevant page task. No speculative client-side primitive or UI dependency was added.

## CSS and component ownership

`app/globals.css` only imports Tailwind, tokens, quarantined legacy CSS, and base rules. `theme.css` is the sole runtime token source; `base.css` owns document defaults and accessibility behavior. New pages use semantic Tailwind utilities and shared primitives. They must not add page selectors to global CSS, static inline styles, raw hex colors, random shadows/radii, `transition-all`, or CSS-in-JS.

`styles/legacy.css` remains a temporary 3,300-line MVP quarantine. It is imported into Tailwind's low-priority base layer so production component utilities win. Its top-level aliases now map to production semantics. Do not add selectors; delete route-owned sections during each approved page redesign.

Static arbitrary Tailwind values are disallowed in normal product work. A rare platform expression such as safe-area math or the internal glass fallback is acceptable only when no named token can express it. Dynamic values such as a backend color swatch may use a narrowly scoped inline style.

Keep primitives Server Component compatible. Add `'use client'` only when browser state, events, or APIs require it. Avoid barrels on hot client paths and import component files directly.

## Development lab and quality gate

The lab is `/design-system` in development. It includes color, type, Bangla/mixed strings, Taka prices, buttons, badges, chips, swatches, forms, semantic feedback, surfaces, loading, and responsive layout. It is `noindex` and calls `notFound()` in production.

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
