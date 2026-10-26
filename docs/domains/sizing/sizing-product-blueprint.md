# Maevelle Fit & Sizing Product Blueprint

**Status:** Approved product direction; implementation blueprint  
**Applies to:** Sizing domain, Catalog product workflows, Supply purchases,
Admin Portal, Storefront  
**Supersedes:** The product-facing workflows and UI assumptions in
`sizing-architecture.md` and `How-to/sizing-guide-for-owners.md`  
**Does not supersede:** Existing server-side integrity, history, organization
isolation, authorization, audit, outbox, concurrency, and publication-safety
requirements unless this document explicitly replaces a rule

## 1. Outcome

Maevelle Fit & Sizing is a fashion-first, reusable-guide capability integrated
directly with products, categories, and supply purchases.

An operator must be able to:

1. create a reusable, customer-ready size or fit guide by manually entering a
   measurement table;
2. assign the guide through a category default, a reviewed supply-purchase
   workflow, or an explicit product selection;
3. understand which guide a product will actually show and why;
4. reconcile the guide's sizes with the Product's purchasable Variants;
5. preview the exact Storefront experience; and
6. publish changes safely when one guide is shared by many Products.

A customer must see only authentic published guide data for the Product they
are buying. Maevelle must never render a generic hardcoded chart, unsupported
fit claim, or simulated recommendation as Product truth.

## 2. Approved product decisions

The following decisions are authoritative for the redesign:

- Optimize everyday workflows for Maevelle's fashion, apparel, footwear, and
  wearable-accessory catalogue.
- Reusable shared guides are the normal case. Product-specific guides are an
  explicit exception.
- Guide measurements are entered manually through an efficient inline grid.
- Category defaults, reviewed Supply-purchase proposals, and manual Product
  selection can all connect guides to Products.
- A direct Product assignment has priority over category inheritance.
- A Supply purchase is evidence and provenance. It cannot silently become a
  competing Storefront inheritance layer or replace Product truth.
- Only the primary Category participates in default-guide inheritance.
- Size-guide revisions remain immutable after publication, but revision
  mechanics are presented as ordinary published state, working changes, and
  history rather than as a prerequisite mental model.
- Domains, canonical systems, definitions, and mapping machinery remain
  available to the platform but move out of the ordinary operator workflow.
- The Storefront Fit Finder is removed until recommendation rules are based on
  authentic guide data, measurement basis, Product availability, fit policy,
  and an explainable confidence result.

## 3. Product language

The interface uses language that reflects operator and customer decisions.
Internal domain terminology must not leak into the default workflow.

| Product-facing term | Meaning | Internal concepts it may compose |
| --- | --- | --- |
| **Fit & Size Guide** | Reusable customer guidance and, when applicable, a measurement matrix | guide, system, definitions, revision, measurements |
| **Product sizes** | Options a customer can purchase | Catalog option axis, option values, Variants |
| **Customer guide** | The published guide effective for one Product | Product assignment or primary-Category default |
| **Working changes** | Editable changes not yet visible to customers | draft revision |
| **Published guide** | Immutable version currently visible to customers | current published revision |
| **Guide source** | Why a Product uses its effective guide | direct Product or primary Category |
| **Assignment origin** | How a direct Product assignment was created | manual, bulk, or Supply-purchase review |
| **Needs attention** | An actionable inconsistency with a recovery action | quality checks and mapping conflicts |

Terms such as `domain`, `system`, `definition`, `unbound`, `canonical`, and
`revision number` may appear in Advanced Settings or diagnostics. They do not
appear in the normal Product and guide-selection workflow.

## 4. Separate customer problems correctly

The platform must not force every measurement into one size-chart experience.

### 4.1 Selectable sizing

The customer chooses a purchasable size such as `S`, `M`, `L`, or `EU 39`.
Examples include clothing, leggings, sets, and footwear.

Requirements:

- Catalog Variants remain authoritative for what can be purchased.
- The guide explains those choices but does not create inventory truth.
- Guide rows and Product size options are reconciled explicitly.
- Only available and valid Product options can be applied from the guide.

### 4.2 Wearable fit guidance

The Product may be one-size or adjustable while still requiring fit guidance.
Examples include hats, waist chains, bracelets, necklaces, and headwear.

The guide may present:

- circumference;
- total length;
- adjustable range;
- extension length;
- recommended body range; and
- measuring instructions.

A selectable S/M/L system is not required when the customer does not choose a
size.

### 4.3 Ordinary Product dimensions

Bag dimensions, mug capacity, hair-clip width, earring drop, and similar facts
belong to Catalog Product specifications, not Fit & Sizing. The Product Details
experience may present them beside fit information, but the Sizing domain must
not own ordinary specification truth.

## 5. Core conceptual model

### 5.1 Fit guide

A reusable guide owns:

- name and optional internal description;
- guide kind;
- measurement basis;
- default display unit policy;
- measurement columns;
- ordered size/fit rows;
- measurement values;
- fit notes;
- measuring instructions;
- optional measurement diagram Media placement;
- working and published state;
- assignments and their impact summary; and
- lifecycle state.

Target guide kinds:

- `APPAREL_SIZE_CHART`
- `FOOTWEAR_SIZE_CHART`
- `WEARABLE_FIT_GUIDE`
- `CUSTOM_FIT_GUIDE`

Measurement basis remains explicit:

- `BODY`: measurements describe the wearer;
- `GARMENT`: measurements describe the physical garment; or
- `PRODUCT`: measurements describe a wearable object.

The customer experience must state the basis in plain language. It must never
present garment measurements as body measurements or recommend a body size from
garment measurements without an explicit ease model.

### 5.2 Guide version

- A published version is immutable.
- Editing a published guide creates or resumes one working version.
- Customers continue seeing the published version until working changes are
  deliberately published.
- Publication validates the whole guide and reports assignment impact.
- History remains inspectable and auditable.
- Restoring historical content creates new working changes; it does not rewrite
  published history.

### 5.3 Guide assignment

There are two runtime assignment scopes:

- `PRODUCT`: direct assignment to one Product;
- `CATEGORY`: default assignment to one Category.

A Product assignment records provenance:

- `MANUAL`
- `BULK`
- `SUPPLY_PURCHASE`
- `MIGRATION`

Provenance explains the assignment but does not add another runtime precedence
layer.

### 5.4 Supply-purchase evidence

A Purchase or Purchase line may retain evidence that a supplier provided or
recommended a guide. The evidence may include the guide, Purchase, supplier,
Product, affected lines, actor, timestamp, and decision.

Possible decisions:

- keep the Product's current guide;
- apply the proposed guide to the Product;
- retain it as Purchase evidence only; or
- treat the supplier fit as materially different and use a separate Product or
  fit/Variant family.

Evidence-only records never participate in Storefront resolution.

## 6. Effective-guide resolution

Resolution is deterministic:

```text
active direct Product assignment with an active published guide
                              ↓ otherwise
active primary-Category default with an active published guide
                              ↓ otherwise
none
```

Rules:

1. Only the Product's primary Category participates.
2. Secondary Categories do not compete for inheritance.
3. Assignment to an archived or unpublished guide is not effective.
4. Invalid legacy references fail closed on the Storefront and appear in Needs
   Attention.
5. A direct assignment may be removed to resume Category inheritance.
6. Moving a Product to a different primary Category previews the resulting
   guide change before the Category change is saved.
7. A Supply-origin assignment is a direct Product assignment after operator
   acceptance.
8. No “most recent Purchase wins” behavior is permitted.

The Product-facing read model returns both effective truth and provenance:

```ts
type EffectiveProductGuide =
  | {
      type: 'DIRECT';
      guideId: string;
      guideName: string;
      publishedVersion: number;
      origin: 'MANUAL' | 'BULK' | 'SUPPLY_PURCHASE' | 'MIGRATION';
      originReference?: { type: 'PURCHASE'; id: string; label: string };
      categoryFallback?: { categoryId: string; categoryName: string; guideId: string; guideName: string };
    }
  | {
      type: 'CATEGORY';
      guideId: string;
      guideName: string;
      publishedVersion: number;
      categoryId: string;
      categoryName: string;
    }
  | {
      type: 'NONE';
      reason: 'NO_ASSIGNMENT' | 'UNAVAILABLE_ASSIGNMENT' | 'ACCESS_RESTRICTED';
    };
```

## 7. Product sizes and guide-row reconciliation

Catalog remains authoritative for Product option axes, option values, Variants,
availability, and inventory. Sizing remains authoritative for guide rows and
measurement meaning.

### 7.1 Automatic reconciliation

When a guide and Product are connected, Maevelle compares the active Product
size-option values with guide rows.

Automatic matching may commit only when a normalized code or label match is
unambiguous within the chosen guide/system. Normalization may handle case,
surrounding whitespace, and explicitly configured aliases such as `XXL` and
`2XL`.

Fuzzy or semantic guesses are suggestions, never silent writes.

The result is reported in operator language:

- `5 of 5 Product sizes match`;
- `Product size XXL is missing from this guide`;
- `Guide size XS is not sold on this Product`; or
- `M could match more than one guide row; choose the intended row`.

### 7.2 Bidirectional accelerators

The Product workflow may offer:

- **Add guide sizes to Product**: creates or stages Catalog size option values
  and Variant-matrix work through Catalog-owned commands.
- **Build guide rows from Product sizes**: creates rows in the working guide
  through Sizing-owned commands.

Neither domain writes directly into the other's tables. An application-level
workflow coordinates semantic commands and reports partial success with a
refresh/recovery path if a later domain rejects its step.

### 7.3 Publication policy

A Product with a selectable Size axis must have one explicit sizing outcome:

- an effective published guide with reconciled sizes; or
- an authorized, auditable **No customer guide** exception with a reason.

Whether the exception blocks Product publication is a configurable Catalog
readiness policy. The interface must never silently treat absence as success.

## 8. Admin information architecture

The default Sizing navigation contains three destinations plus Advanced
Settings:

1. **Guides** — the default landing page and reusable guide library.
2. **Assignments** — categories, Products, Supply-origin assignments, and bulk
   operations.
3. **Needs Attention** — actionable exceptions and recovery.
4. **Advanced Settings** — templates, measurement vocabulary, canonical
   systems, aliases/mappings, archived foundations, and technical diagnostics.

The current integrity dashboard does not remain the landing page. Healthy
technical checks do not consume primary-screen space. A compact attention
summary links to actionable filtered results.

### 8.1 Route direction

```text
/sizing                         Guides library
/sizing/guides/new              Guide creation
/sizing/guides/:guideId         Guide workspace
/sizing/assignments             Assignment workspace
/sizing/attention               Needs-attention worklist
/sizing/settings                Advanced settings landing
/sizing/settings/templates      Guide structures and defaults
/sizing/settings/standards      Domains, systems, definitions, measurements
/sizing/settings/mappings       Unresolved aliases and canonical mappings
```

Existing deep links may redirect to the corresponding new destination during
the replacement. The final interface must not maintain two competing sizing
workspaces.

## 9. Guides library

The library answers four questions immediately:

1. Which guides exist?
2. Are they customer-ready?
3. What do they cover?
4. Where are they used?

### 9.1 Primary controls

- Search by guide name.
- Filter by kind, publication state, lifecycle, and attention state.
- Sort by recently updated, most used, name, and needs attention.
- Create guide.
- Select guides for bounded bulk lifecycle or assignment actions when safe.

### 9.2 Row/card content

- guide name;
- guide kind and measurement basis;
- concise size/range summary;
- published, working changes, draft-only, or archived state;
- Product and Category usage counts;
- first actionable issue, when any;
- last updated date; and
- open/preview action.

### 9.3 Wireframe

```text
┌ Fit & Size Guides ─────────────────────────────── [Create Guide] ┐
│ Search…    Type: All    Status: Active    Sort: Recently updated │
├───────────────────────────────────────────────────────────────────┤
│ Women's Kurti Standard             Published · Working changes    │
│ Apparel · Garment · S–XXL          18 Products · 2 Categories     │
│                                        [Preview] [Open]            │
├───────────────────────────────────────────────────────────────────┤
│ EU Women's Footwear                Published                      │
│ Footwear · Body · EU 35–42         5 Products · 1 Category        │
│                                        [Preview] [Open]            │
└───────────────────────────────────────────────────────────────────┘
```

Mobile uses one full-width card per guide with the same information and a
single primary Open action. Filters use a touch-friendly sheet.

## 10. Guide creation and editing

Guide creation is a dedicated page because manual matrix entry, preview, and
publication are a substantial task. It is not a small modal.

### 10.1 Step 1 — Starting structure

Choose one:

- Women's tops, Kurtis, and shirts
- Dresses and sets
- Leggings and stretchwear
- Bottoms and skirts
- EU women's footwear
- Hats and head circumference
- Waist chains and adjustable accessories
- Bracelets and wrist fit
- Necklaces and chain lengths
- One-size garment measurements
- Custom

A starting structure supplies guide kind, basis, suggested columns, units, and
optional canonical sizes. It does not supply authoritative measurement values
unless the operator intentionally chooses a previously published guide to
duplicate.

### 10.2 Step 2 — Guide identity

- Guide name
- Optional internal description
- Measurement basis in plain language
- Default unit
- Optional canonical standard under Advanced Options

Internal codes are generated and hidden in the normal workflow.

### 10.3 Step 3 — Manual measurement grid

Rows represent reusable size or fit labels. Columns represent measurements.

Required interaction behavior:

- direct inline editing;
- Tab and Shift+Tab horizontal movement;
- Enter vertical movement;
- paste one cell, a row, a column, or a rectangular table;
- add, rename, reorder, and remove rows and columns;
- default unit per column;
- optional per-value override only when required;
- exact or range entry;
- deliberate approximate marker;
- duplicate/fill-down action;
- undo for destructive row or column removal during the session;
- visible validation without modal interruption;
- working-change autosave with explicit saved/saving/error feedback; and
- unsaved navigation protection when a local change has not reached the server.

Per-cell dialogs are not the primary entry mechanism.

```text
┌ Women's Kurti Standard ─ Working changes saved ───── [Preview] ┐
│ Measurements describe: Garment       Default unit: inches      │
├──────────┬────────┬────────┬────────┬──────────┬───────────────┤
│ Size     │ Bust   │ Waist  │ Hip    │ Length   │ Shoulder      │
├──────────┼────────┼────────┼────────┼──────────┼───────────────┤
│ S        │ 36     │ 32     │ 38     │ 42       │ 14            │
│ M        │ 38     │ 34     │ 40     │ 43       │ 14.5          │
│ L        │ 40     │ 36     │ 42     │ 44       │ 15            │
│ XL       │ 42     │ 38     │ 44     │ 45       │ 15.5          │
│ + Add    │        │        │        │          │               │
└──────────┴────────┴────────┴────────┴──────────┴───────────────┘
                                           [+ Measurement]
```

On mobile, edit one size row at a time in a full-height sheet while retaining a
compact read-only table overview. Horizontal table scrolling is not the only
editing method.

### 10.4 Step 4 — Customer guidance

- Fit note
- General measuring instructions
- Column-specific instructions inherited from the measurement vocabulary and
  editable for this guide when necessary
- Optional measurement diagram selected from Media or uploaded through the
  Media-owned workflow

The interface does not invent model height, fabric stretch, shrinkage, or
stylist-contact claims not present in authoritative Product/guide data.

### 10.5 Step 5 — Review and publish

The review presents:

- exact Storefront preview;
- missing or invalid measurements;
- duplicate or ambiguous size labels;
- assignment impact;
- Product-size reconciliation impact;
- added, removed, and changed rows/columns compared with the published version;
  and
- a specific Publish action.

Publication copy example:

> Publish these changes to 18 Products and 2 Category defaults. Two Products
> need attention because their available sizes no longer fully match this
> guide.

Publishing cannot be reduced to a generic confirmation dialog when material
impact exists.

## 11. Guide workspace

Opening a guide uses four stable sections:

- **Chart** — working/published table and customer guidance;
- **Customer Preview** — the exact shared Storefront rendering;
- **Assignments** — Categories, Products, and Supply-origin provenance;
- **History** — published versions, working changes, actors, and timestamps.

The primary header shows name, customer-visible state, working-change state,
usage, Preview, and the next valid lifecycle action. Revision pills and
technical versions do not dominate the header.

## 12. Assignment workspace

### 12.1 Category defaults

The operator can assign an active published guide to one or more Categories.

The workflow shows:

- Category path;
- current default;
- number of Products inheriting it;
- number of Products with direct overrides;
- affected Products that do not reconcile; and
- the guide that will become effective after the change.

The same Category default is visible and editable from Category management.
Both surfaces use the same contract and command.

### 12.2 Direct Product assignments

The operator can assign a guide to:

- one Product;
- explicitly selected Products;
- the current bounded filtered result; or
- Products from a specific Supply purchase.

Before applying a bulk change, show:

- total Products;
- how many inherit a Category guide;
- how many have a direct assignment that would be replaced;
- how many have no current guide;
- reconciliation conflicts; and
- a reviewable list with conflict exclusions.

The command uses an idempotency key and returns per-Product results. It must not
pretend the batch was wholly successful when some Product assignments fail.

### 12.3 Removing an override

The action is phrased as:

> Remove direct guide and use the primary Category default.

The interface previews the resulting effective guide or states that no guide
will remain.

## 13. Product creation and editing

Fit & Sizing belongs beside Product variants and organization, not as an
independent configuration universe.

### 13.1 Triggering the workflow

When the operator adds or loads a size-like option axis, the Product workspace
shows a prominent Fit & Size section. For Products without selectable sizes,
the section remains compact and offers wearable fit guidance only when relevant
to the Product Type.

Title-keyword inference may suggest but never establish sizing behavior.
Product Type and explicit operator choices remain authoritative.

### 13.2 Guide-source control

The normal control is one discriminated choice:

- **Use primary Category guide** — includes the actual inherited guide name;
- **Choose another shared guide**;
- **Create a shared guide**;
- **Create a Product-specific guide**; or
- **No customer guide** — requires an allowed reason when the Product has sizes.

The operator does not separately choose a system and guide. Selecting a guide
provides its compatible system internally.

### 13.3 Result card

```text
┌ Customer Fit & Size Guide ────────────────────────────────────┐
│ Women's Kurti Standard                         Published      │
│ Source: Primary Category · Women's Kurtis                     │
│ Product sizes: S, M, L, XL, XXL                              │
│ Guide match: 5 of 5                                          │
│                           [Preview] [Choose Another]           │
└───────────────────────────────────────────────────────────────┘
```

If no guide matches, provide in-context recovery rather than sending the
operator to a generic dashboard.

### 13.4 Cross-domain save behavior

The interface presents one coherent workflow while preserving domain
ownership:

- Catalog saves Product identity, options, Variants, and Category membership.
- Sizing saves guide drafts and assignments.
- The application coordinator starts independent operations early, sequences
  dependent commands explicitly, and reports partial success.
- A failed assignment cannot make a successful Catalog save appear rolled
  back when it was not.
- The refreshed effective-guide read model is authoritative after success or
  partial success.

## 14. Product details

Product Details shows the customer outcome first:

```text
Customer sizing
Women's Kurti Standard · Published
Inherited from primary Category: Women's Kurtis
5 of 5 Product sizes match

[Preview as Customer] [Change Guide] [Open Guide]
```

When directly assigned:

```text
Assigned directly · Origin: Purchase PO-1048
Category fallback: Women's Kurti Standard
```

Technical system, canonical mapping IDs, and lifecycle versions live in an
Advanced Details disclosure for authorized operators.

## 15. Supply-purchase integration

### 15.1 Placement

The Purchase detail Items experience adds a Fit & Sizing status for unique
Products represented by its lines. Multiple Variant lines of the same Product
share one Product-level decision.

Possible states:

- Product guide retained;
- proposed guide pending review;
- Purchase evidence only;
- applied to Product;
- conflict requiring decision; or
- not applicable.

### 15.2 Review workflow

For an applicable Product:

```text
Supplier fit information
Current Product guide: Women's Kurti Standard

(•) Keep current Product guide
( ) Apply another shared guide to Product
( ) Create a reusable guide from this Purchase
( ) Retain guide as Purchase evidence only

[Review impact]
```

Applying a guide shows the exact Product and Storefront consequence. It creates
or replaces a direct Product assignment with `SUPPLY_PURCHASE` provenance only
after confirmation.

### 15.3 Conflicting purchases

When later Purchase evidence differs from the Product's guide, the operator
must choose deliberately:

- retain the current Product guide;
- publish a revised guide for all affected Products;
- assign a different existing guide to the Product; or
- create a separate Product/fit family because the supplied item is materially
  different.

The latest Purchase never wins automatically.

## 16. Needs Attention

This is an operator worklist, not a wall of health metrics.

Each row states the affected resource, customer/business consequence, and one
primary recovery action.

Target issue types include:

- Product has selectable sizes but no explicit sizing outcome;
- effective guide is unavailable;
- Product size missing from guide;
- guide row not sold by Product;
- ambiguous Product-to-guide match;
- unpublished changes on a guide used by active Products;
- Category default points to an unavailable guide;
- Supply purchase proposes a different guide;
- published guide is structurally invalid due to legacy data; and
- active technical foundations remain under archived parents.

Filters and pagination are URL-backed. Resolution opens the exact Product,
guide, Category, or Purchase context rather than a generic module page.

## 17. Storefront experience

### 17.1 Entry point

When an effective published guide exists, **Size & Fit Guide** appears beside
the Product's size selector and remains reachable on mobile without relying on
hover.

When no guide exists, no fake or fallback chart is shown.

### 17.2 Sheet/modal content

The shared customer component renders only `PublicSizeGuideDto` or its additive
successor. It contains:

1. guide name;
2. plain-language measurement basis;
3. fit note, when present;
4. dynamic measurement table built from actual rows and columns;
5. unit switch only when every displayed unit has an approved conversion;
6. measuring instructions relevant to the actual columns;
7. optional authentic measurement diagram; and
8. size selection only for rows mapped to selectable Product options.

```text
┌ Size & Fit Guide ─ Women's Kurti Standard ─────────────── [×] ┐
│ Garment measurements                              [in] [cm]   │
│ True to size. If between sizes, choose the larger size.       │
│                                                               │
│ Size      Bust      Waist      Hip       Length                │
│ S         36        32         38        42                    │
│ M         38        34         40        43                    │
│ L         40        36         42        44                    │
│                                                               │
│ How to measure                                                │
│ Bust — Measure the garment at the fullest point…              │
│                                                               │
│                         [Close] [Select M]                     │
└───────────────────────────────────────────────────────────────┘
```

### 17.3 Removed behavior

The replacement removes:

- hardcoded universal garment rows;
- universal apparel artwork on unrelated guide types;
- hardcoded model measurements;
- invented fabric/stretch/shrink claims;
- hardcoded stylist contact information;
- a bust-only Fit Finder; and
- applying a guide row that does not map to a real Product option.

### 17.4 Future recommendation capability

A Fit Finder may return only when the data model and product policy support:

- explicit body-versus-garment basis;
- measurement-specific matching rules;
- ease and fit-preference policy;
- Product availability;
- supported missing-data behavior;
- explainable output and confidence; and
- focused validation against real Products.

It is a separate capability, not a decorative tab in the guide component.

## 18. Responsive and accessible behavior

### Admin

- Desktop uses a dense but readable inline grid with sticky row/column context.
- Tablet supports horizontal overview and focused row editing.
- Mobile uses full-height row/column editing sheets with preserved draft state.
- Important actions meet touch-target requirements.
- All destructive changes have specific confirmation or an undo window.
- Async save, validation, and publication feedback is announced politely.
- Focus moves to the first invalid field or cell after failed validation.
- Filters and tabs are deep-linkable.

### Storefront

- Mobile uses a safe-area-aware full-height or bottom sheet.
- Desktop uses a centered modal with bounded height.
- Focus is trapped and restored to the triggering control.
- Escape and an explicit Close action are supported.
- Rows that select a size use buttons/radios or equivalent keyboard semantics,
  never click-only table rows.
- Wide tables expose scroll affordance and retain the Size column.
- Content works at 200% zoom and with long translated measurement names.
- Reduced-motion preferences are honored.

Both applications use their established semantic tokens and primitives. No new
feature-local color system, global page CSS, `transition-all`, or broad ancestor
selector is introduced.

## 19. Target contracts

Contracts use additive evolution while the current applications migrate. The
final UI consumes one stable product-facing language and does not reconstruct
business rules independently.

### 19.1 Guide summary

```ts
interface FitGuideSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly kind: 'APPAREL_SIZE_CHART' | 'FOOTWEAR_SIZE_CHART' | 'WEARABLE_FIT_GUIDE' | 'CUSTOM_FIT_GUIDE';
  readonly measurementBasis: 'BODY' | 'GARMENT' | 'PRODUCT';
  readonly lifecycleStatus: 'ACTIVE' | 'ARCHIVED';
  readonly publicationState: 'DRAFT_ONLY' | 'PUBLISHED' | 'PUBLISHED_WITH_CHANGES';
  readonly publishedVersion: number | null;
  readonly rowSummary: string;
  readonly productCount: number;
  readonly categoryCount: number;
  readonly attentionCount: number;
  readonly updatedAt: string;
}
```

### 19.2 Customer guide

The public DTO is dynamic and contains no apparel-specific fixed fields:

```ts
interface PublicFitGuideDto {
  readonly name: string;
  readonly kind: FitGuideSummaryDto['kind'];
  readonly measurementBasis: 'BODY' | 'GARMENT' | 'PRODUCT';
  readonly fitNotes: string | null;
  readonly instructions: string | null;
  readonly columns: readonly {
    readonly id: string;
    readonly name: string;
    readonly instructions: string | null;
    readonly defaultUnit: 'cm' | 'inch' | 'kg';
  }[];
  readonly rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly productOptionValueId: string | null;
    readonly isSelectable: boolean;
    readonly values: readonly {
      readonly columnId: string;
      readonly exact?: string;
      readonly min?: string;
      readonly max?: string;
      readonly unit: 'cm' | 'inch' | 'kg';
      readonly isApproximate: boolean;
    }[];
  }[];
  readonly diagram?: {
    readonly url: string;
    readonly altText: string;
    readonly width: number;
    readonly height: number;
  };
}
```

### 19.3 Assignment preview and apply

Every material assignment command has a preview contract. The apply command
uses the preview's version/token so stale impact cannot be confirmed blindly.

```ts
interface GuideAssignmentPreviewDto {
  readonly previewToken: string;
  readonly guide: { readonly id: string; readonly name: string; readonly publishedVersion: number };
  readonly totalTargets: number;
  readonly inheritedTargets: number;
  readonly directAssignmentsToReplace: number;
  readonly targetsWithoutGuide: number;
  readonly conflictCount: number;
  readonly targets: readonly GuideAssignmentTargetPreviewDto[];
}
```

The server validates guide availability, organization ownership,
authorization, Product/Category existence, expected versions, and preview
freshness again during apply.

## 20. Target API surface

Existing endpoints may be evolved or replaced coherently, but the public shape
should converge on resource-oriented commands:

```text
GET    /admin/sizing/guides
POST   /admin/sizing/guides
GET    /admin/sizing/guides/:guideId
PATCH  /admin/sizing/guides/:guideId

GET    /admin/sizing/guides/:guideId/working-version
PUT    /admin/sizing/guides/:guideId/working-version/matrix
PATCH  /admin/sizing/guides/:guideId/working-version/guidance
POST   /admin/sizing/guides/:guideId/publish-preview
POST   /admin/sizing/guides/:guideId/publish

GET    /admin/sizing/assignments
POST   /admin/sizing/assignments/preview
POST   /admin/sizing/assignments/apply
DELETE /admin/sizing/products/:productId/assignment

GET    /admin/sizing/products/:productId/effective-guide
GET    /admin/sizing/products/:productId/reconciliation
POST   /admin/sizing/products/:productId/reconcile

GET    /admin/sizing/attention

GET    /admin/procurement/purchases/:purchaseId/sizing
POST   /admin/procurement/purchases/:purchaseId/sizing-decisions/preview
POST   /admin/procurement/purchases/:purchaseId/sizing-decisions

GET    /storefront/v1/products/:handle/fit-guide
```

Growing lists are paginated with deterministic ordering. Mutations use the
established success/error envelopes, expected versions, structured conflicts,
and idempotency for retryable bulk operations.

## 21. Ownership and authorization

### Domain ownership

- Sizing owns guides, versions, rows, measurement values, assignments,
  reconciliation metadata, and sizing audit/outbox events.
- Catalog owns Products, Product Types, Categories, options, option values,
  Variants, publication readiness, and ordinary Product dimensions.
- Supply owns suppliers, Purchases, Purchase lines, and supplier evidence.
- Media owns uploaded assets and renditions.

Cross-domain behavior uses application services and public domain contracts.

### Capabilities

The target distinguishes at least:

- read guides and effective sizing;
- create/edit guides;
- publish guides;
- manage assignments;
- manage Advanced sizing foundations; and
- review/apply Supply-origin guide proposals.

Authentication alone grants none of these. Every read and write remains
organization-isolated.

## 22. Frontend component architecture

The replacement must not reproduce the current page-sized client components.

Suggested Admin organization:

```text
features/sizing/
├── guide-library/
│   ├── guide-library-page.tsx
│   ├── guide-filters.tsx
│   └── guide-list.tsx
├── guide-editor/
│   ├── guide-editor-provider.tsx
│   ├── guide-identity-section.tsx
│   ├── measurement-grid/
│   ├── guidance-section.tsx
│   ├── publish-review.tsx
│   └── customer-preview.tsx
├── assignments/
│   ├── assignment-workspace.tsx
│   ├── assignment-preview.tsx
│   └── effective-guide-card.tsx
├── attention/
├── product-integration/
├── purchase-integration/
└── data/
```

The guide editor provider exposes a typed interface:

```ts
interface GuideEditorContextValue {
  readonly state: GuideEditorState;
  readonly actions: GuideEditorActions;
  readonly meta: {
    readonly canEdit: boolean;
    readonly canPublish: boolean;
    readonly isSaving: boolean;
    readonly hasUnsavedLocalChanges: boolean;
  };
}
```

Guide-kind-specific content uses explicit composed variants rather than a
single component controlled by many booleans.

The Storefront uses one brand-consistent `ProductFitGuide` composition driven
entirely by the public DTO. The same renderer is reused in Admin Customer
Preview with an explicit preview data adapter.

## 23. Existing implementation disposition

### Preserve after focused audit

- database separation of guide, revision, row, measurement, and configuration;
- immutable publication history;
- tenant isolation and capability checks;
- transactional publication and assignment safeguards;
- category default and Product override semantics;
- defensive public omission of unavailable guides;
- optimistic concurrency, audit, and outbox behavior;
- useful existing database tests for archive, publication, mismatch, and
  Storefront projection rules.

### Replace or substantially refactor

- current Sizing navigation and diagnostic-first landing page;
- monolithic guide list/editor/standards/mapping pages;
- separate system-plus-guide Product controls;
- per-cell measurement dialogs as the main editing interaction;
- standalone mapping console as an ordinary required workflow;
- fragmented Category default management;
- Product Details implementation-language presentation;
- the complete hardcoded Storefront size-guide dialog; and
- outdated owner documentation.

### Add where the current model lacks support

- guide kind and explicit product-facing measurement basis if the current
  domain fields cannot express them cleanly;
- assignment provenance and optional Purchase reference;
- Supply-purchase sizing evidence/decision history;
- preview/apply contracts for material assignment impact;
- direct Product reconciliation read model;
- authorized no-guide exception and reason when required by readiness policy;
  and
- dynamic public columns and row-to-Product-option mapping.

Schema changes follow the repository's mutable development-baseline policy.

## 24. Implementation sequence

This sequence manages risk; it does not redefine the complete capability as a
smaller product phase.

1. **Correct customer truth**
   - replace the hardcoded Storefront dialog with dynamic published guide data;
   - remove the unsupported Fit Finder and invented claims;
   - establish the additive public contract and exact Admin preview renderer.
2. **Establish target read models and assignment provenance**
   - effective-guide result;
   - reconciliation result;
   - assignment origin and Supply evidence;
   - attention worklist contracts.
3. **Build the guide library and manual editor**
   - templates as structures;
   - inline grid;
   - guidance;
   - autosave/conflict recovery;
   - impact-aware publication.
4. **Integrate Product creation and Product Details**
   - one guide-source control;
   - automatic reconciliation;
   - bidirectional size accelerators;
   - customer-outcome detail card.
5. **Build Assignment and Category workflows**
   - Category defaults;
   - manual/bulk Product assignment;
   - remove-override preview;
   - stale-safe preview/apply.
6. **Integrate Supply purchases**
   - evidence capture;
   - reviewed Product assignment;
   - conflicting-Purchase decisions;
   - traceable provenance.
7. **Complete Needs Attention and Advanced Settings**
   - contextual repairs;
   - move technical foundations away from the primary workflow;
   - retire obsolete routes and documentation.
8. **Close responsive and owner acceptance**
   - mobile, tablet/iPad, desktop;
   - keyboard and screen-reader paths;
   - realistic shared-guide publication and assignment scenarios;
   - exact Storefront outcomes.

## 25. Acceptance scenarios

The redesign is not complete until the following work end to end.

### Shared apparel guide

1. Operator creates a Kurti guide from a structural template.
2. Operator manually enters S–XXL measurements in the inline grid.
3. Operator previews and publishes it.
4. Operator assigns it as the primary Category default.
5. Products in that Category inherit it.
6. Product sizes reconcile automatically.
7. Storefront renders the exact published measurements.

### Manual Product override

1. Product inherits a Category guide.
2. Operator selects a different shared guide for the Product.
3. Impact and mismatch are previewed.
4. Direct assignment becomes effective.
5. Removing it restores the current primary-Category default.

### Supply-purchase proposal

1. Purchase contains several Variant lines for one Product.
2. Operator associates another shared guide with the supplier evidence.
3. Maevelle detects the Product currently uses a different guide.
4. Operator deliberately keeps, applies, or stores evidence only.
5. Storefront truth changes only after an Apply-to-Product decision.

### Shared-guide update

1. Operator edits a guide used by many Products.
2. Customers continue seeing the previous published version.
3. Publish review reports affected Products and mismatches.
4. Operator publishes.
5. All effective Products receive the new published version without changing
   their assignments.

### Wearable accessory

1. Operator creates an adjustable waist-chain guide with total length and
   recommended waist range.
2. No S/M/L system is required.
3. Storefront renders useful fit guidance without a false size selector.

### No-guide exception

1. Product has size options but no suitable guide.
2. Operator cannot silently proceed as if sizing were complete.
3. Authorized operator records an allowed reason or creates/assigns a guide.
4. Product readiness and Needs Attention reflect the decision accurately.

## 26. Focused verification

Implementation checkpoints use the narrowest useful proof, with broader
verification at the completed-area boundary.

Required focused coverage includes:

- effective-guide precedence and primary-Category-only inheritance;
- Product assignment origin and removal;
- Purchase evidence never affecting public truth without acceptance;
- organization isolation and capability authorization;
- guide publication and optimistic conflict recovery;
- bulk assignment idempotency and partial results;
- exact/alias/ambiguous size reconciliation;
- public omission of unavailable guide state;
- Storefront dynamic rows/columns and Product-option selection;
- responsive grid editing and customer modal behavior;
- keyboard entry, focus restoration, and validation announcements; and
- fresh-baseline migration construction when schema changes land.

## 27. Completion statement

The completed capability is not “a new guide editor.” It is the coherent path
from reusable manual guide authoring, through Category/Product/Supply
assignment and reconciliation, to the exact published customer experience.

The backend may remain sophisticated. The operator experience must make the
correct action obvious, the customer consequence visible, and the wrong action
difficult.
