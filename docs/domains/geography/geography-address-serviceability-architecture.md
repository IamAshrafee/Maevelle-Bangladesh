# Maevelle Ecommerce — Geography, Address & Serviceability Architecture

**Document:** `docs/domains/geography/geography-address-serviceability-architecture.md`
**Status:** Initial Domain Architecture / Living Document
**Version:** 0.1
**Related:** Customers, Storefront, Orders, Delivery, Warehouse, Suppliers, Analytics, Settings, Integrations

---

# 1. Purpose

This document defines how Maevelle understands:

```text
Countries

Administrative geography

Cities

Upazilas

Thanas

Unions

Municipalities

City Corporations

Wards

Areas / Localities

Villages

Postal Codes

Addresses

Provider-specific zones

Delivery serviceability
```

The purpose is not to create a GIS platform.

The purpose is to make:

```text
Checkout addresses

Courier booking

Delivery pricing

Customer records

Warehouse addresses

Supplier addresses

Area analytics

Serviceability
```

reliable and provider-neutral.

---

# 2. Central Principle

> **Human-entered Address Text, Canonical Geography, Postal Geography and Courier Provider Geography are separate concepts.**

Example:

```text
Customer writes:

House 12, Road 5,
Kazipara, Mirpur, Dhaka
```

Maevelle may understand:

```text
Canonical District:
Dhaka

Canonical locality:
Kazipara / Mirpur context

Postal Code:
1216

Pathao Area ID:
X

Steadfast Area ID:
Y
```

These values represent different systems.

They must never be collapsed into one field.

---

# 3. Second Core Principle

> **Provider IDs never become Maevelle's geography identity.**

Forbidden:

```text
address.pathao_area_id
```

as canonical address identity.

Correct:

```text
Address
   ↓
Canonical Geography
   ↓
Provider Geography Mapping
   ├── Pathao
   ├── Steadfast
   └── Future Courier
```

---

# 4. Third Core Principle

> **Official geographic structure must be data, not application code.**

Never code:

```text
if district === "Dhaka"
```

for hierarchy/serviceability behavior.

Official administrative structure can change.

Recent Bangladesh National Portal snapshots themselves illustrate why hard-coded counts are dangerous: the portal shows 8 divisions and 64 districts, while recent portal snapshots have shown different upazila totals.

---

# 5. Fourth Core Principle

> **Bangladesh geography is not one universal four-level tree.**

A rural address may naturally involve:

```text
Division
→ District
→ Upazila
→ Union
→ Village
```

while an urban address may involve:

```text
Division
→ District
→ City Corporation
→ Ward
→ Locality
```

or:

```text
District
→ Thana
→ Locality
```

Government location standards themselves distinguish these different types rather than treating everything as an Upazila/Union chain.

---

# 6. Fifth Core Principle

> **Checkout should not expose the complexity of the canonical geography model.**

The backend may understand:

```text
Division

District

Upazila

Union

Ward

Postal Office

Provider Zone

Coordinates
```

while Customer may only need to enter:

```text
District

Area

Detailed Address

Landmark
```

depending on serviceability requirements.

---

# 7. Sixth Core Principle

> **Historical transactional addresses are snapshots.**

If:

```text
an Area is renamed

Ward boundary changes

Postal Code changes

Customer edits address
```

existing:

```text
Orders

Deliveries

Returns
```

must continue showing the address used at the time.

---

# 8. Domain Ownership

Geography owns:

```text
Canonical geographic areas

Area types

Geography hierarchy

Aliases

Official/source codes

Geography dataset versions

Postal-code reference foundation

Local delivery/service areas

Provider geography mappings

Serviceability rules

Geography matching/resolution

Address normalization support
```

---

# 9. Geography Does Not Own

Geography does not own:

```text
Customer Address relationship
→ Customers

Order Address Snapshot
→ Orders

Delivery Address Snapshot
→ Delivery

Warehouse
→ Warehouse

Supplier
→ Procurement

Customer delivery charge
→ Pricing

Courier booking
→ Delivery

Provider HTTP integrations
→ Integrations
```

---

# 10. Bangladesh Canonical Foundation

Current official National Portal data lists:

```text
8 Divisions

64 Districts
```

and publishes administrative lists below them.

The architecture must import/reference official data where practical but remain capable of handling later changes without migrations to application code.

---

# 11. BBS Geography Codes

Bangladesh Bureau of Statistics publishes geographic codes through:

```text
Union / Ward
```

level and maintains official division code classifications.

Maevelle should therefore support external canonical source codes such as:

```text
BBS
```

without making those codes its internal primary keys.

---

# 12. Why Not Use BBS Code as Primary Key?

Because:

```text
external codes may evolve

multiple source systems may exist

historical codes may be replaced

some operational localities may not have the desired BBS granularity
```

Use:

```text
Maevelle UUID
```

as identity.

Store BBS codes as external authoritative references.

---

# 13. Core Geography Entity

Canonical entity:

```text
GeographicArea
```

---

# 14. Geographic Area

Conceptually:

```text
GeographicArea {
    id
    type
    parent
    canonicalName
    localName
    status
    country
}
```

---

# 15. Geography Area Types

V1 supported types should include at minimum:

```text
COUNTRY

DIVISION

DISTRICT

UPAZILA

THANA

CITY_CORPORATION

MUNICIPALITY

UNION

WARD

LOCALITY

VILLAGE
```

---

# 16. Additional Types Foundation

Architecture should permit later:

```text
MOUZA

ZONE

POSTAL_AREA

NEIGHBORHOOD

SERVICE_AREA
```

without schema redesign.

---

# 17. Do Not Overload `AREA`

A generic UI word:

```text
Area
```

can map to several canonical types.

But database should still know:

```text
WARD

LOCALITY

UNION

THANA
```

where known.

---

# 18. Type Registry

Recommended:

```text
geography.area_types
```

or a controlled application enum if types are platform-defined.

V1 recommendation:

```text
code-controlled stable type vocabulary
```

because type semantics affect application logic.

---

# 19. Geographic Hierarchy

Each canonical area can have:

```text
parent_area_id
```

where the official relationship forms a hierarchy.

---

# 20. Example Rural

```text
Bangladesh
   ↓
Dhaka Division
   ↓
Manikganj District
   ↓
Saturia Upazila
   ↓
Union
   ↓
Village
```

---

# 21. Example Urban

```text
Bangladesh
   ↓
Dhaka Division
   ↓
Dhaka District
   ↓
Dhaka North City Corporation
   ↓
Ward
   ↓
Locality
```

---

# 22. Thana

`THANA` must remain distinct.

Do not blindly map:

```text
Thana = Upazila
```

because metropolitan/address usage can differ.

---

# 23. City Corporation

First-class geography node.

Do not encode:

```text
city = "Dhaka"
```

and then lose:

```text
Dhaka North

Dhaka South
```

administrative context.

---

# 24. Municipality

First-class type:

```text
MUNICIPALITY
```

for পৌরসভা / Paurashava context.

---

# 25. Ward

Ward should preserve parent type context.

Examples:

```text
City Corporation Ward

Municipality Ward
```

A single generic `WARD` type can have:

```text
ward_authority_type
```

or subtype metadata.

---

# 26. Government Type Compatibility

Bangladesh's official land-information standard distinguishes types including:

```text
Division

District

Upazila

Thana

Union

Mouza

Village

City Corporation

City Corporation Ward

Municipality

Municipality Ward

Union Ward

Zone
```

which supports the typed-node architecture rather than a fixed column hierarchy.

---

# 27. Geographic Area Names

Each Area should support:

```text
canonical English name

canonical Bangla name

display name

normalized search name
```

---

# 28. Names Are Not Identity

Example spellings:

```text
Chattogram

Chittagong

চট্টগ্রাম
```

may refer to the same canonical place.

Do not create three Area records.

---

# 29. Geography Aliases

Introduce:

```text
geography.area_aliases
```

---

# 30. Alias Examples

```text
Chittagong
→ Chattogram

Dacca
→ Dhaka

Mohammadpur
→ canonical Mohammadpur locality
```

---

# 31. Bangla/English Aliases

Support both:

```text
মিরপুর

Mirpur
```

as search inputs.

---

# 32. Transliteration

Transliteration may improve search.

But:

> transliteration output must not overwrite authoritative/local spelling.

Use it only as:

```text
search alias / normalization aid.
```

---

# 33. Spelling Error Support

Search can optionally tolerate:

```text
Mipur

Mirpoor
```

through fuzzy search.

But fuzzy match should not silently commit a high-impact provider mapping.

---

# 34. Geography Search

Canonical search input:

```text
query text
+
optional parent context
+
optional area types
```

---

# 35. Why Parent Context Matters

There may be multiple:

```text
Mirpur
```

or similar names.

Search result should show:

```text
Mirpur
Dhaka District
```

versus another place with similar name.

---

# 36. Search Ranking

Rank by:

```text
exact canonical name

exact alias

prefix match

normalized match

parent context

serviceability relevance

fuzzy match
```

---

# 37. Geography Source

Each canonical Area should preserve source provenance.

Examples:

```text
BBS

National Portal

Government import

Verified Manual

Operational Locality
```

---

# 38. Source Record

Recommended:

```text
geography.area_source_references
```

---

# 39. Source Reference

Fields:

```text
geographic_area_id

source_system

source_type

external_code

source_name

source_version

valid_from

valid_to

last_verified_at
```

---

# 40. One Area, Multiple External Codes

Example:

```text
Maevelle Area ID
    ├── BBS code
    ├── government portal reference
    └── future GIS code
```

---

# 41. Dataset Version

Introduce explicit:

```text
Geography Dataset Version
```

for bulk source imports.

---

# 42. Why Version Source Data?

If an official dataset changes:

```text
Area renamed

new Upazila created

Area split

Area merged
```

we need to know:

```text
which source version introduced the change.
```

---

# 43. Geography Data Import

Flow:

```text
Acquire Source
      ↓
Validate
      ↓
Normalize
      ↓
Diff Current Dataset
      ↓
Review Structural Changes
      ↓
Publish Geography Version
```

---

# 44. Do Not Blindly Auto-Apply

If import says:

```text
100 areas disappeared
```

because source parsing broke:

```text
do not archive them automatically.
```

Require sanity validation.

---

# 45. Change Types

Dataset diff can classify:

```text
NEW

RENAMED

MOVED

SPLIT

MERGED

ARCHIVED

CODE_CHANGED

UNCHANGED
```

---

# 46. Rename

Example:

```text
old canonical name
→ new canonical name
```

Old name becomes:

```text
Alias.
```

---

# 47. Area Split

Old Area may transition:

```text
ACTIVE
→ HISTORICAL
```

with successor relationships.

---

# 48. Area Merge

Same principle.

Do not rewrite historical address snapshots.

---

# 49. Area Successor Relationships

Potential table:

```text
geography.area_successors
```

for:

```text
SPLIT_INTO

MERGED_INTO

RENAMED_TO
```

---

# 50. Area Status

Recommended:

```text
ACTIVE

HISTORICAL

DEPRECATED

UNVERIFIED
```

---

# 51. Historical Area

Still valid for:

```text
old Order Address

old Delivery

Analytics historical attribution
```

but not offered for new Checkout selection unless policy allows.

---

# 52. Address Is Not Geography

A Customer Address is:

```text
specific deliverable destination.
```

Geography provides structured context.

---

# 53. Address Components

Canonical address structure should support:

```text
recipient_name

phone

address_line_1

address_line_2

building / house

road / street

village / locality text

landmark / directions

postal_code

country_code

canonical geography references

latitude / longitude
```

Not every field is mandatory.

---

# 54. Bangladesh Checkout UX

Do not ask Customers to understand administrative-government hierarchy unnecessarily.

Recommended initial customer input:

```text
Name

Phone

District

Area / Thana / Upazila / Locality

Detailed Address

Landmark optional
```

The exact progressive fields depend on where provider-neutral serviceability can be resolved reliably.

---

# 55. Avoid Excessive Dropdowns

Bad Checkout:

```text
Division
District
Upazila
Union
Ward
Mouza
Village
Post Office
Post Code
```

for every customer.

This maximizes abandonment and still may not improve courier accuracy.

---

# 56. Progressive Address Resolution

Better:

```text
Customer selects District
        ↓
Searches Area
        ↓
System resolves best canonical locality
        ↓
Detailed free-form street/house description
```

---

# 57. Rural Address UX

Where needed:

```text
District

Upazila

Union / Area

Village

Detailed Directions
```

can be presented.

---

# 58. Urban Address UX

Potential:

```text
District / City

Thana / Area

Detailed Address

Landmark
```

---

# 59. One UX Does Not Fit All

Address form may adapt based on selected geography type.

---

# 60. Address Resolution

System should produce:

```text
AddressResolution
```

containing:

```text
canonical areas

confidence

unresolved text

postal code if known

provider mapping readiness

serviceability status
```

---

# 61. Resolution Confidence

Recommended:

```text
EXACT

HIGH

MEDIUM

LOW

UNRESOLVED
```

---

# 62. Automatic Commit Threshold

Only:

```text
EXACT / HIGH
```

matches should be committed automatically where mapping ambiguity is absent.

---

# 63. Medium Match

Can ask Customer/Admin to select:

```text
Did you mean...
```

---

# 64. Low Match

Preserve human-entered address and flag:

```text
ADDRESS_REVIEW_REQUIRED
```

rather than selecting arbitrary geography.

---

# 65. Unresolved Address

May still be legitimate.

Example:

```text
new neighborhood

informal locality

village missing from dataset
```

Do not force Customer to choose a false Area.

---

# 66. Manual Address Fallback

Allow:

```text
canonical geography to known parent
+
free-form unresolved locality
```

---

# 67. Example

Known:

```text
District = Dhaka
```

Unresolved:

```text
"XYZ New Housing Project, Block C"
```

System can preserve both.

---

# 68. Serviceability With Unresolved Address

Potential:

```text
KNOWN_SERVICEABLE_PARENT

MANUAL_REVIEW_REQUIRED

NOT_SERVICEABLE
```

depending policy.

---

# 69. Address Quality

Recommended operational field:

```text
address_quality_status
```

---

# 70. Address Quality States

```text
VERIFIED

RESOLVED

PARTIALLY_RESOLVED

UNRESOLVED

INVALID
```

---

# 71. Verified ≠ Delivered

A structurally resolved address can still be undeliverable in practice.

Do not equate:

```text
Address Verified
```

with:

```text
Delivery guaranteed.
```

---

# 72. Coordinate Support

Optional:

```text
latitude

longitude
```

---

# 73. Coordinate Source

Preserve:

```text
CUSTOMER_PIN

GEOCODER

OPERATOR

COURIER

WAREHOUSE

IMPORT
```

---

# 74. Coordinate Precision

Do not invent exact coordinates from a broad Area centroid.

If only Area-level location is known:

```text
do not pretend it is customer's house.
```

---

# 75. Location Accuracy

Potential metadata:

```text
ROOFTOP

STREET

LOCALITY

AREA_CENTROID

UNKNOWN
```

---

# 76. Coordinates Are Not Required V1

Bangladesh delivery can function without exact GPS for many cases.

Architecture remains ready.

---

# 77. Address Snapshot

When Order commits:

```text
Order Address Snapshot
```

copies customer-provided and resolved geography details.

---

# 78. Snapshot Should Preserve

```text
Human-readable address

Canonical Area IDs where known

Canonical names at the time

Postal code

Coordinates where provided

Address quality

Source
```

---

# 79. Why Preserve Names Too?

If Area master name changes later:

```text
historical invoice/delivery should still display what was valid at Order time.
```

---

# 80. Delivery Snapshot

Delivery receives its own address snapshot from Order.

If Delivery address is legally/operationally amended:

```text
new Delivery snapshot/version
```

is recorded.

Order snapshot stays historical.

---

# 81. Warehouse Addresses

Warehouse Location may reference:

```text
Canonical Geography

structured address

coordinates
```

but remains Warehouse-owned.

---

# 82. Supplier Addresses

Same geography foundation can support Supplier addresses.

Do not create separate country/district string vocabularies in Procurement.

---

# 83. Postal Codes

Postal Codes are first-class reference data but not the canonical hierarchy.

Bangladesh Post publishes postal-code data tied to post offices, and individual districts can contain many different post offices/codes—for example the official Dhaka listing includes distinct codes for Dhaka GPO, Wari, New Market, Mohammadpur, Gulshan, Banani, Mirpur and others.

---

# 84. Therefore

Do not model:

```text
District
1 → 1 Postal Code
```

or:

```text
Upazila
1 → 1 Postal Code.
```

---

# 85. Postal Entity

Recommended:

```text
geography.postal_areas
```

---

# 86. Postal Area

Fields:

```text
id

country_code

postal_code

post_office_name

post_office_name_local

status

source

last_verified_at
```

---

# 87. Postal Geography Relationship

Recommended:

```text
geography.postal_area_geography_links
```

because postal and administrative boundaries need not be assumed identical.

---

# 88. Postal Code Input

Checkout can:

```text
auto-suggest

auto-fill

or allow manual entry
```

based on resolved Area.

---

# 89. Do Not Reject Good Address Solely for Missing Postal Code

Courier needs may vary.

Postal Code should be:

```text
required only if current delivery policy/provider requires it.
```

---

# 90. Service Area

A **Service Area** is operational.

It answers:

```text
Where can Maevelle currently offer a particular Delivery Method?
```

---

# 91. Service Area ≠ Administrative Area

A Service Area may cover:

```text
one District

several Wards

part of one Locality

nationwide except exclusions.
```

---

# 92. Serviceability

Serviceability is a decision produced from:

```text
Delivery Method

Origin

Destination

Package

Payment/COD requirement

Current policy

Provider capabilities
```

---

# 93. Serviceability Result

Recommended:

```text
SERVICEABLE

NOT_SERVICEABLE

MANUAL_REVIEW

TEMPORARILY_UNAVAILABLE
```

---

# 94. Why `TEMPORARILY_UNAVAILABLE`?

Example:

```text
Provider API outage
```

is different from:

```text
Provider does not serve this district.
```

---

# 95. Serviceability Reason

Examples:

```text
AREA_UNSUPPORTED

PROVIDER_UNAVAILABLE

COD_UNSUPPORTED

WEIGHT_EXCEEDED

PACKAGE_RESTRICTED

GEOGRAPHY_UNMAPPED

METHOD_DISABLED

ORIGIN_UNSUPPORTED

MANUAL_REVIEW_REQUIRED
```

---

# 96. Serviceability Rule

Conceptually:

```text
ServiceabilityRule {
    deliveryMethod
    destinationScope
    originScope
    constraints
    status
    priority
}
```

---

# 97. Destination Scope

Could be:

```text
Geographic Area

Area + descendants

Explicit local Service Area

Country-wide
```

---

# 98. Descendant Semantics

Rule must explicitly specify:

```text
INCLUDE_DESCENDANTS
```

rather than assuming every Area rule automatically includes children.

---

# 99. Exclusions

Example:

```text
Dhaka District
include descendants

except:
specific islands/remote locations
```

Exclusion wins.

---

# 100. Serviceability Rule Priority

Recommended deterministic order:

```text
Explicit exclusion

Exact-area override

More-specific ancestor rule

General rule

Default deny
```

---

# 101. Default

Recommended:

> **Delivery Serviceability defaults to DENY when no trusted rule/provider coverage establishes availability.**

Do not promise delivery based on absence of data.

---

# 102. Customer-Facing Error

Do not say:

```text
Provider geography mapping ID missing.
```

Show:

```text
Delivery is not currently available for this area.
```

Admin sees technical reason.

---

# 103. Provider Geography

Each courier can maintain its own hierarchy.

Example conceptual provider model:

```text
Provider City

Provider Zone

Provider Area
```

Maevelle should not assume every provider uses the same hierarchy.

---

# 104. Provider Geography Entity

Recommended:

```text
geography.provider_areas
```

---

# 105. Provider Area Fields

```text
id

organization_id

integration_account_id

provider_area_type

external_id

parent_external_id / parent_provider_area_id

name

status

raw_metadata

source_version

synced_at
```

---

# 106. Why Store Provider Area Records?

Instead of only:

```text
canonical_area → external_id
```

we gain:

```text
provider hierarchy

provider rename history

mapping diagnostics

serviceability sync

area search
```

---

# 107. Provider Geography Mapping

Separate:

```text
geography.provider_area_mappings
```

---

# 108. Mapping

Conceptually:

```text
Canonical Area
↔
Provider Area
```

---

# 109. Mapping Cardinality

Do not assume always:

```text
1 canonical
→ 1 provider area.
```

Possible:

```text
one canonical locality
→ multiple provider service areas
```

or vice versa.

Use relationship records.

---

# 110. Mapping Status

```text
MAPPED

PARTIAL

UNMAPPED

AMBIGUOUS

DEPRECATED
```

---

# 111. Mapping Confidence

```text
EXACT

VERIFIED_MANUAL

HIGH

LOW
```

---

# 112. Automatic Mapping

Safe only for strong matches such as:

```text
exact stable external code

explicit mapping import

confirmed deterministic hierarchy
```

---

# 113. Name Matching

Provider Area:

```text
Mirpur 10
```

Canonical:

```text
Mirpur Section 10
```

may be a candidate.

Do not auto-confirm solely because normalized strings are similar.

---

# 114. Manual Mapping

Operator can resolve:

```text
Provider Area X
→ Canonical Locality Y
```

with audit.

---

# 115. Mapping Review Queue

Admin needs:

```text
Unmapped provider areas

Ambiguous matches

Deprecated mappings

Provider hierarchy changes
```

---

# 116. Provider Geography Sync

Flow:

```text
Provider API
   ↓
Fetch Areas
   ↓
Store Provider Dataset Version
   ↓
Compare Previous
   ↓
Update Provider Areas
   ↓
Invalidate/Review Changed Mappings
```

---

# 117. Never Delete Old Provider Area Immediately

If provider removes Area ID:

```text
mark DEPRECATED
```

because historical Courier Bookings may reference it.

---

# 118. Provider Area Rename

Update current display name.

Preserve historical booking snapshot.

---

# 119. Provider Area ID Change

Do not mutate old External ID in historical records.

New Provider Area record or versioned reference.

---

# 120. Provider Dataset Version

Recommended:

```text
geography.provider_geography_syncs
```

---

# 121. Sync Record

```text
integration_account

started_at

completed_at

status

provider_version if available

area_count

created_count

updated_count

deprecated_count

error
```

---

# 122. Sync Health

Admin should know:

```text
Last successful sync

Current provider mapping completeness

Unmapped count

Changed area count
```

---

# 123. Provider Data Unavailable

Existing verified mappings may remain usable according to freshness policy.

---

# 124. Mapping Freshness

Possible:

```text
FRESH

STALE

VERY_STALE

UNKNOWN
```

---

# 125. Stale Does Not Automatically Mean Invalid

Provider area data may not change frequently.

But Admin gets warning.

---

# 126. Provider Mapping at Booking

Delivery Adapter receives:

```text
canonical address
```

and queries:

```text
current provider mapping.
```

---

# 127. Historical Booking

Courier Booking snapshots:

```text
provider area IDs/names actually used.
```

Future mapping changes do not alter booking history.

---

# 128. Provider Mapping Missing

Automated booking should return:

```text
PROVIDER_GEOGRAPHY_UNMAPPED
```

and create operational exception.

---

# 129. Manual Fallback

Operator may:

```text
select Provider Area manually

record mapping candidate

continue booking
```

if authorized.

---

# 130. Do Not Corrupt Canonical Address

Manual provider choice:

```text
Provider Zone 123
```

does not change Customer canonical Area unless operator separately fixes the address resolution.

---

# 131. Serviceability Layers

Serviceability can be evaluated at multiple levels:

```text
Maevelle method policy

Provider capability

Provider coverage

Package constraints

COD constraint

Operational outage
```

---

# 132. Evaluation

Conceptually:

```text
Method Enabled?
     ↓
Local Rule Allows?
     ↓
Provider Mapping Exists?
     ↓
Provider Supports Destination?
     ↓
Package Supported?
     ↓
COD Supported?
     ↓
SERVICEABLE
```

---

# 133. Provider Selection

Serviceability returns candidate providers.

Delivery can later select:

```text
preferred provider

lowest cost

manual choice

policy-selected provider
```

---

# 134. Do Not Put Provider Selection in Geography

Geography says:

```text
available/not available.
```

Delivery orchestration selects provider.

---

# 135. Delivery Pricing Integration

Serviceability produces eligible:

```text
Delivery Method/Service Level
```

and pricing input.

Pricing determines customer charge.

---

# 136. Example

```text
Dhaka Metro

Standard Home Delivery

Customer Charge:
৳80

Candidate Providers:
Pathao
Steadfast
```

---

# 137. Provider Quote Is Operational

Pricing may consume it as input if policy says:

```text
customer charge = provider quote + margin
```

but this is not mandatory.

---

# 138. Free Delivery

Promotions can reduce customer delivery charge to:

```text
৳0
```

without changing serviceability.

---

# 139. Serviceability Cache

Serviceability can be cached where safe.

Cache key may include:

```text
Delivery Method

Origin Area

Destination Area

Package class

COD flag

Provider configuration version
```

---

# 140. Final Booking Revalidation

Even if Checkout used cached serviceability:

```text
Courier Booking
```

revalidates current provider requirements.

---

# 141. Checkout Should Not Depend on One Live Courier API

Strong recommendation.

Maintain enough local:

```text
coverage rules

provider mapping

rate policy
```

to keep Checkout operational where business policy permits.

---

# 142. Provider Real-Time Verification

Can be used when required.

But provider outage must produce:

```text
TEMPORARILY_UNAVAILABLE
```

rather than ambiguous success.

---

# 143. Address Validation

Do not equate validation with:

```text
perfect postal address.
```

V1 validation checks:

```text
required fields

phone

supported country

resolved service area where needed

reasonable text length

no obviously impossible data
```

---

# 144. Address Sanitization

Free-text fields remain untrusted.

Apply:

```text
length bounds

control-character restrictions

HTML escaping on display

safe logging
```

---

# 145. Do Not Over-Normalize

Customer entered:

```text
"বাসা ১২, রোড ৫"
```

should not be rewritten into lossy English.

Preserve original text.

---

# 146. Original vs Normalized

Store:

```text
original address text
```

and optionally:

```text
normalized searchable representation.
```

---

# 147. Address Fingerprint

Potential internal duplicate-detection feature.

Derived from normalized:

```text
phone

area

address
```

But:

> fingerprint is only a duplicate signal, not identity.

---

# 148. Customer Address Duplicate

If Customer saves same address twice:

```text
suggest reuse
```

rather than silently merging.

---

# 149. Address Versioning

Customer Address mutable master data uses:

```text
version
```

for concurrent edits.

---

# 150. Historical Customer Address

If Customer deletes an Address:

```text
Orders remain unaffected.
```

---

# 151. Customer Address Delete

Prefer:

```text
ARCHIVED
```

when historical references exist.

---

# 152. Default Address

Only one:

```text
default delivery address
```

per Customer if that feature is introduced.

Use partial unique invariant.

---

# 153. Address Verification Sources

Potential:

```text
CUSTOMER

OPERATOR

SUCCESSFUL_DELIVERY

GEOCODER

PROVIDER
```

---

# 154. Successful Delivery Signal

If Courier repeatedly delivers successfully to one Address:

```text
address confidence may improve.
```

Do not automatically alter canonical geography from provider data.

---

# 155. Failed Delivery Signal

`INVALID_ADDRESS` can reduce operational confidence.

But one courier failure does not prove:

```text
address permanently invalid.
```

---

# 156. Delivery History

Future Address Quality can learn from:

```text
successful deliveries

RTO

address-related failures
```

without becoming an opaque fraud score.

---

# 157. Serviceability Overrides

Business may need:

```text
temporarily disable delivery to Area X.
```

---

# 158. Override

Recommended:

```text
geography.serviceability_overrides
```

---

# 159. Override Types

```text
ALLOW

DENY

MANUAL_REVIEW
```

---

# 160. Override Requirements

```text
reason

starts_at

ends_at optional

actor

audit
```

---

# 161. Emergency Disable

Example:

```text
flood

civil disruption

provider outage
```

can temporarily mark Area/method unavailable.

---

# 162. Historical Effect

New Checkouts honor current override.

Existing Orders remain valid business history and enter delivery exception handling if needed.

---

# 163. Geographic Analytics

Transactional facts should preserve:

```text
canonical geography snapshot IDs
```

where available.

---

# 164. Why Snapshot Geography?

Customer may later move.

Order should remain attributed to:

```text
the delivery geography at Order time.
```

---

# 165. Analytics Dimensions

Potential:

```text
Division

District

Upazila/Thana

City Corporation

Area

Provider Area

Postal Code
```

---

# 166. Official Reporting Geography vs Operational Geography

Analytics must distinguish:

```text
Canonical District
```

from:

```text
Courier Zone.
```

Do not combine them as one dimension.

---

# 167. RTO by Area

Use canonical address geography where possible.

Provider Area can be a separate operational dimension.

---

# 168. Historical Boundary Change

A District/Area hierarchy change can create two reporting modes later:

```text
AS_RECORDED

CURRENT_GEOGRAPHY_ROLLUP
```

V1 requires at least:

```text
AS_RECORDED.
```

---

# 169. Search Index

Recommended search document can include:

```text
canonical names

Bangla names

English names

aliases

parent names

postal codes
```

---

# 170. Search Technology

V1 PostgreSQL is sufficient.

Potential:

```text
normalized text columns

trigram search

full-text where useful
```

No external geography search engine required initially.

---

# 171. Address Autocomplete

Autocomplete should query:

```text
canonical local geography
```

not live courier APIs.

---

# 172. Provider-Aware Indicator

Result can show:

```text
Delivery available
```

using current serviceability projection.

---

# 173. Do Not Expose Provider Mapping IDs

Storefront autocomplete response contains Maevelle Area ID only.

---

# 174. Geography API — Storefront

Potential:

```text
GET /api/storefront/v1/geography/districts

GET /api/storefront/v1/geography/areas?q=mirpur&district_id=...

GET /api/storefront/v1/geography/areas/{id}

POST /api/storefront/v1/delivery/options
```

---

# 175. Search Instead of Massive Nested Download

Prefer:

```text
search + parent filter
```

rather than sending every village/ward in Bangladesh to browser.

---

# 176. District List

Small enough to cache heavily.

---

# 177. Area Search

Can search:

```text
Upazila

Thana

Union

Ward

Locality

Municipality
```

but return simplified UI labels.

---

# 178. Storefront Area Result

Example:

```text
Mirpur
Dhaka
```

rather than:

```text
LOCALITY_NODE_TYPE_14
```

---

# 179. Admin Geography API

Recommended:

```text
GET /api/admin/v1/geography/areas

GET /api/admin/v1/geography/areas/{id}

GET /api/admin/v1/geography/areas/{id}/aliases

GET /api/admin/v1/geography/provider-mappings

POST /api/admin/v1/geography/provider-mappings

GET /api/admin/v1/geography/unmapped-provider-areas

POST /api/admin/v1/geography/provider-syncs

GET /api/admin/v1/geography/provider-syncs/{id}

GET /api/admin/v1/geography/serviceability

POST /api/admin/v1/geography/serviceability-overrides
```

---

# 180. Geography Is Mostly Read-Heavy

Most ordinary staff should not edit canonical geography.

---

# 181. Permissions

Potential:

```text
geography.view

geography.manage

geography.alias.manage

geography.provider_mapping.view

geography.provider_mapping.manage

geography.sync

delivery_serviceability.view

delivery_serviceability.manage

delivery_serviceability.override
```

---

# 182. Canonical Geography Edit Permission

High privilege.

Changing parent/type can impact:

```text
Checkout

Analytics

Provider mappings

serviceability.
```

---

# 183. Impact Preview

Before moving/archiving Geography Area, show:

```text
Customer Addresses

Orders

Warehouses

Provider mappings

Serviceability Rules
```

affected.

---

# 184. `geography.geographic_areas`

Recommended schema:

```text
id
country_code
area_type
parent_area_id NULL

canonical_name
canonical_name_local NULL

status

sort_order NULL

source_priority

created_at
updated_at
version
```

---

# 185. Organization Ownership?

Canonical national geography should not be duplicated once per Organization.

Recommended:

```text
platform/global geography dataset
```

for countries/official administrative areas.

---

# 186. Organization-Specific Localities

Maevelle may need operational Areas not present in official dataset.

Therefore geographic Area can have:

```text
ownership_scope
```

---

# 187. Ownership Scope

```text
GLOBAL

ORGANIZATION
```

---

# 188. Global

Examples:

```text
Bangladesh

Dhaka Division

Dhaka District
```

---

# 189. Organization

Example:

```text
Maevelle operational locality:
"Mirpur DOHS Gate 1 Zone"
```

if needed.

---

# 190. Organization Area Cannot Alter Global Area

It can:

```text
reference global parent
```

but not mutate official master data.

---

# 191. `geography.area_aliases`

```text
id
geographic_area_id
organization_id NULL
alias
language_code NULL
alias_type
normalized_alias
status
created_at
```

---

# 192. Alias Types

```text
ALTERNATE_NAME

FORMER_NAME

TRANSLITERATION

COMMON_NAME

SEARCH_ALIAS

PROVIDER_ALIAS
```

---

# 193. Provider Alias

Can aid matching but is not confirmed mapping.

---

# 194. `geography.area_source_references`

```text
id
geographic_area_id
source_system
source_type
external_code
source_name
source_version
valid_from NULL
valid_to NULL
last_verified_at
```

---

# 195. Unique Source Code

Conceptually:

```text
source_system
+
source_type
+
external_code
```

must uniquely identify active source record.

---

# 196. `geography.geography_dataset_versions`

```text
id
source_system
version_label
published_at NULL
imported_at
status
checksum NULL
record_count
metadata_json
```

---

# 197. `geography.area_successors`

```text
predecessor_area_id
successor_area_id
relationship_type
effective_at
source_version_id
```

---

# 198. `geography.postal_areas`

```text
id
country_code
postal_code
post_office_name
post_office_name_local NULL
status
source_system
source_reference
last_verified_at
```

---

# 199. `geography.postal_area_links`

```text
postal_area_id
geographic_area_id
relationship_type
confidence
```

---

# 200. `geography.provider_areas`

```text
id
organization_id
integration_account_id

provider_area_type
external_id
parent_provider_area_id NULL

name
normalized_name

status
provider_dataset_version

raw_metadata_json NULL

created_at
updated_at
```

---

# 201. Provider External Unique

```text
integration_account_id
+
provider_area_type
+
external_id
```

unique.

---

# 202. `geography.provider_area_mappings`

```text
id
organization_id
integration_account_id

geographic_area_id
provider_area_id

mapping_type
confidence
status

created_by_actor_type
created_by_actor_id NULL

verified_at NULL

created_at
updated_at
version
```

---

# 203. Mapping Types

```text
EXACT

CONTAINS

PARTIAL_COVERAGE

OPERATIONAL_EQUIVALENT
```

---

# 204. `geography.provider_geography_syncs`

```text
id
organization_id
integration_account_id

status
started_at
completed_at NULL

provider_version NULL

received_count
created_count
updated_count
deprecated_count

error_code NULL
details_json NULL
```

---

# 205. `geography.service_areas`

Optional operational grouping.

```text
id
organization_id
code
name
status
created_at
updated_at
version
```

---

# 206. `geography.service_area_members`

```text
service_area_id
geographic_area_id
include_descendants
membership_type
```

Membership:

```text
INCLUDE

EXCLUDE
```

---

# 207. `geography.serviceability_rules`

```text
id
organization_id
delivery_method_id

origin_service_area_id NULL
destination_service_area_id

cod_policy
package_constraints_json NULL

result

priority

starts_at NULL
ends_at NULL

status

created_at
updated_at
version
```

---

# 208. JSON Constraint Boundary

Package/service constraints may initially use typed JSON because supported courier constraints can evolve.

But common fields should graduate to columns when frequently queried.

---

# 209. `geography.serviceability_overrides`

```text
id
organization_id
delivery_method_id
geographic_area_id
include_descendants
override_result
reason
starts_at
ends_at NULL
created_by
created_at
```

---

# 210. Serviceability Projection

Strongly preferred:

```text
geography.serviceability_projection
```

for fast Checkout reads.

---

# 211. Projection Fields

Could include:

```text
organization

delivery method

origin

destination canonical area

serviceability

available provider count

freshness

updated_at

projection_version
```

---

# 212. Projection Is Not Authority

Final courier booking rechecks authoritative:

```text
provider

mapping

capabilities

current delivery state.
```

---

# 213. Address Schema Refinement — Customer

Existing:

```text
customers.customer_addresses
```

should add/reference:

```text
country_code

division_area_id NULL

district_area_id NULL

locality_area_id NULL

postal_area_id NULL

address_quality_status

latitude NULL

longitude NULL

coordinate_source NULL

unresolved_locality_text NULL
```

---

# 214. Do We Need One Column Per Geography Level?

Not for every possible level.

Recommended:

```text
primary locality reference
```

plus derived ancestor hierarchy.

For convenient query/reporting, commonly used:

```text
district_area_id
```

may be denormalized/validated.

---

# 215. Better Canonical Model

Address fundamentally references:

```text
locality_area_id
```

and the system resolves ancestors:

```text
District

Division

etc.
```

---

# 216. Why Store District Snapshot Too?

Transactions may benefit from:

```text
fast/filterable historical District attribution.
```

For mutable Customer Address, canonical hierarchy can be resolved dynamically.

For Order/Delivery Snapshot:

```text
store District ID/name snapshot.
```

---

# 217. Address Structure Recommendation

Customer master:

```text
locality_area_id

postal_area_id

address_line_1

address_line_2

landmark

unresolved_locality_text

coordinates
```

plus optional cached:

```text
district_area_id
```

for operational speed.

---

# 218. Order Snapshot

Should persist explicit:

```text
country

division ID/name

district ID/name

locality ID/type/name

postal code

free-form address

landmark

coordinates

resolution quality
```

---

# 219. Delivery Snapshot

Copies from Order and preserves:

```text
provider geography snapshot
```

on Courier Booking separately.

---

# 220. Address Data Migration

Existing old Customer addresses with strings:

```text
area = "Mirpur"

city = "Dhaka"

district = "Dhaka"
```

can be migrated through:

```text
resolution pipeline
```

with confidence.

---

# 221. Never Auto-Map Low Confidence Migration

Keep:

```text
legacy text

resolution status
```

until reviewed.

---

# 222. Import Address Handling

Customer/Order imports should accept:

```text
canonical IDs
```

when known.

Otherwise:

```text
human text
→ resolution
```

---

# 223. Integration Address Contracts

External API should not require callers to know provider-specific Area IDs.

Use Maevelle:

```text
geographic_area_id
```

or structured free-form address.

---

# 224. Provider-Specific Integration Escape Hatch

A trusted courier-focused integration may optionally provide provider Area reference.

But it must be treated as:

```text
provider mapping hint
```

not canonical Customer geography.

---

# 225. Duplicate Area Names

Database uniqueness must not be:

```text
UNIQUE(name)
```

---

# 226. Canonical Area Uniqueness

Potential:

```text
parent_area_id
+
area_type
+
normalized canonical name
```

with source-code uniqueness providing stronger official identity where available.

---

# 227. Hierarchy Cycle

Prevent:

```text
Dhaka District
→ child Mirpur
→ parent Dhaka District
```

cycles.

---

# 228. Move Area

Semantic:

```text
MoveGeographicArea
```

not raw parent PATCH for privileged canonical operations.

---

# 229. Descendant Query

Need efficient:

```text
all descendants
```

for serviceability and analytics.

---

# 230. Hierarchy Implementation Choices

Potential:

```text
adjacency list + recursive CTE

closure table

materialized path
```

---

# 231. V1 Recommendation

Use:

```text
adjacency list
+
closure table/projection if query evidence requires
```

or maintain explicit closure structure from the beginning if serviceability descendant checks become extremely frequent.

Exact implementation should be settled during PostgreSQL DDL review.

---

# 232. Do Not Use Nested Sets

Frequent hierarchy changes/import updates make them unnecessarily awkward.

---

# 233. Geography Cache

Official area hierarchy changes rarely.

Can cache aggressively.

---

# 234. Cache Invalidation

Dataset publication increments:

```text
geography_version
```

and invalidates relevant caches.

---

# 235. Storefront Geography Version

Responses can expose:

```text
dataset_version
```

for debugging but customers need not see it.

---

# 236. Geography Commands

Recommended:

```text
ImportGeographyDataset

PublishGeographyDataset

CreateOperationalLocality

UpdateOperationalLocality

ArchiveOperationalLocality

AddAreaAlias

MoveGeographicArea

SyncProviderGeography

MapProviderArea

UnmapProviderArea

CreateServiceArea

UpdateServiceArea

CreateServiceabilityRule

CreateServiceabilityOverride

ExpireServiceabilityOverride

ResolveAddress

VerifyAddressResolution
```

---

# 237. Geography Queries

Recommended:

```text
ListDivisions

ListDistricts

SearchGeographicAreas

GetGeographicArea

GetAreaAncestors

GetAreaDescendants

ResolveAddress

SearchPostalCodes

GetProviderMapping

ListUnmappedProviderAreas

GetServiceability

GetServiceabilityExplanation

GetGeographyHealth

GetProviderGeographySyncStatus
```

---

# 238. `ResolveAddress`

Should be usable by:

```text
Customers

Checkout

Imports

Admin manual Orders

Warehouse setup
```

through published Geography interface.

---

# 239. Resolve Result

Conceptually:

```text
ResolvedAddress {
    canonicalAreas
    postalArea
    normalizedDisplay
    unresolvedText
    confidence
    quality
    warnings
}
```

---

# 240. Serviceability Explanation

Admin query should answer:

```text
Why is delivery unavailable?
```

Example:

```text
Delivery Method:
Standard

Canonical Area:
Kazipara

Pathao:
Mapped + serviceable

Steadfast:
Unmapped

Local Rule:
Allowed

Final:
SERVICEABLE
```

---

# 241. Do Not Show This Complexity to Customer

Customer receives:

```text
Standard Delivery available
৳80
```

---

# 242. Geography Health Checks

Required:

```text
Hierarchy cycle

Active child under invalid parent

Duplicate external source code

Area with missing canonical name

Active provider area with no parent where required

Ambiguous provider mappings

Mapped deprecated provider area

Mapping to historical canonical area

Stale provider geography

Serviceability rule with no reachable areas

Postal reference conflict

Address snapshot missing required geography
```

---

# 243. Address Health Checks

Operational:

```text
Customer Address unresolved

Delivery Address has no serviceable provider mapping

Successful Delivery on supposedly unsupported area

Repeated address-related RTO

Postal Code mismatch candidate
```

---

# 244. Do Not Auto-Correct from Health Check

Health check detects.

Repair is explicit.

---

# 245. Geography Integrity Issue

Use platform:

```text
Integrity Issue
```

for serious problems.

---

# 246. Provider Mapping Exception

Can also produce Integration/Delivery exception where booking is affected.

---

# 247. Failure Scenario — Provider Renames Area

Correct:

```text
Provider Area current name updated

mapping remains if external identity unchanged

historical Booking snapshot unchanged.
```

---

# 248. Failure Scenario — Provider Changes Area ID

Correct:

```text
old Provider Area deprecated

new Provider Area created

mapping review

historical bookings preserve old external ID.
```

---

# 249. Failure Scenario — Government Renames Area

Correct:

```text
canonical new name

old name becomes alias

historical address snapshots unchanged.
```

---

# 250. Failure Scenario — Area Split

Correct:

```text
old Area historical

new Areas created

successor links

new Checkout uses new Areas

old Orders continue referencing historical Area.
```

---

# 251. Failure Scenario — Customer Types Unknown Village

Correct:

```text
resolve known District/Upazila

preserve village text

do not invent canonical Village

serviceability from known parent where allowed.
```

---

# 252. Failure Scenario — Same Name in Two Districts

Search requires parent context.

No silent first-match selection.

---

# 253. Failure Scenario — Courier Mapping Missing During Booking

Correct:

```text
Delivery remains READY/EXCEPTION

no malformed provider booking

mapping can be fixed

booking retried idempotently.
```

---

# 254. Failure Scenario — Provider Geography API Down

Existing trusted provider mapping remains usable under configured freshness policy.

Sync becomes:

```text
FAILED
```

with warning.

---

# 255. Failure Scenario — Provider Returns Empty Area Dataset

Do not:

```text
deprecate every provider area.
```

Treat as suspicious sync failure.

---

# 256. Sync Safety Thresholds

Potential safeguards:

```text
record-count drop threshold

schema validation

required root areas

duplicate ID detection
```

before publication.

---

# 257. Failure Scenario — Customer Address Changed After Order

Customer master updates.

Order/Delivery snapshots remain unchanged.

---

# 258. Failure Scenario — Provider Area Mapping Was Wrong

Historical Booking retains what was actually submitted.

Mapping gets corrected for future bookings.

Current Delivery may require explicit provider update/rebooking.

---

# 259. Failure Scenario — Postal Code Incorrect But Courier Delivered

Address remains historically what customer provided.

Customer master can be corrected separately.

Successful delivery can provide verification signal.

---

# 260. Geography Security

Canonical Geography data is low sensitivity.

Customer Address is PII.

Do not confuse the two.

---

# 261. Public Geography API

Can expose:

```text
area names

hierarchy

search aliases necessary for UI
```

but not:

```text
Customer addresses

provider credentials

internal operational notes.
```

---

# 262. Coordinates Privacy

Customer exact coordinates are PII-like address data.

Apply same permissions as delivery address.

---

# 263. Provider Mapping Security

Provider Area IDs themselves are not necessarily secret.

But provider configuration/account details remain protected.

---

# 264. Logging

Do not log full:

```text
Customer address

phone

coordinates
```

in generic application logs.

---

# 265. Audit

Audit:

```text
Canonical Area manual changes

Provider Mapping changes

Serviceability Rules

Emergency overrides

manual Address verification

provider sync repair
```

---

# 266. Geography Analytics

Track operational quality:

```text
Address resolution rate

Unresolved checkout addresses

Provider mapping coverage

Serviceability coverage

Address-related delivery failures

Mapping failures

Provider geography freshness
```

---

# 267. Provider Mapping Coverage

Formula example:

```text
Active checkout-relevant canonical Areas
with valid Provider mapping
/
active checkout-relevant canonical Areas
```

but exact denominator belongs Metric Catalog.

---

# 268. Address Resolution Rate

Could distinguish:

```text
Exact

High confidence

Partial

Unresolved
```

rather than a single misleading percentage.

---

# 269. Serviceability Coverage

Should be reported by:

```text
Delivery Method

Provider

District

Area
```

where useful.

---

# 270. Bangladesh Data Source Strategy

Recommended source hierarchy:

```text
Government/BBS canonical administrative data

Bangladesh Post postal data

Verified operational localities

Courier provider geography data
```

with each data family preserved separately.

BBS provides official geographic-code classifications through union/ward level, while Bangladesh Post separately publishes post-office/postcode data; this supports treating administrative and postal geography as linked but distinct datasets.

---

# 271. Never Scrape Courier UI as Permanent Architecture

If provider offers:

```text
API / supported data endpoint
```

use provider adapter.

If manual source is temporarily required:

```text
import as provider dataset with provenance
```

rather than hard-code values in code.

---

# 272. Seed Data Repository

Geography seed data should be version-controlled or reproducibly imported.

Do not bury:

```text
64 districts
```

inside frontend JavaScript.

---

# 273. Production Geography Bootstrap

Deployment process:

```text
Create Database
      ↓
Run Schema Migration
      ↓
Load Approved Geography Dataset Version
      ↓
Validate Integrity
      ↓
Publish Dataset
```

---

# 274. Environment Consistency

Development/test environments need predictable geography fixtures.

Could use:

```text
small representative Bangladesh subset
```

for unit tests and:

```text
full approved dataset
```

for integration/staging tests.

---

# 275. Test Geography Fixture

Must include:

```text
urban city corporation path

rural upazila/union path

same-name ambiguity

historical Area

unmapped Area

postal Area

provider mapping
```

---

# 276. Serviceability Test Fixture

Include:

```text
fully supported

explicitly denied

parent allowed/child denied

temporarily disabled

provider unmapped

COD unsupported

provider outage
```

---

# 277. Geography Invariants

### GEO-INV-001

Canonical Geography identity never depends on courier-provider external IDs.

### GEO-INV-002

Human-entered Address text and canonical Geography remain separate.

### GEO-INV-003

Postal geography and administrative geography remain separate.

### GEO-INV-004

Geographic hierarchy is data-driven rather than hard-coded into application logic.

### GEO-INV-005

The model supports both rural and urban Bangladesh geography structures.

### GEO-INV-006

An Area name is never globally unique identity.

### GEO-INV-007

Bangla/English/legacy spellings can resolve to one canonical Area through aliases.

### GEO-INV-008

External government/BBS codes are references, not database primary keys.

### GEO-INV-009

Historical Areas remain resolvable after rename/split/merge.

### GEO-INV-010

Historical Order/Delivery address snapshots never change because Geography master data changes.

### GEO-INV-011

Customer Address edits never rewrite committed Order Addresses.

### GEO-INV-012

Unresolved address text is preserved rather than replaced with guessed canonical data.

### GEO-INV-013

Low-confidence geography matching cannot silently become authoritative.

### GEO-INV-014

Provider Geography is imported/versioned independently of canonical Geography.

### GEO-INV-015

Provider Area Mapping can be missing without corrupting the Customer Address.

### GEO-INV-016

Provider Area Mapping changes affect future provider operations, not historical Courier Booking snapshots.

### GEO-INV-017

A provider geography-sync failure cannot deprecate the entire provider dataset without sanity checks.

### GEO-INV-018

Delivery Serviceability and geographic existence are separate concepts.

### GEO-INV-019

A valid Address can still be not serviceable.

### GEO-INV-020

A serviceable Area can become temporarily unavailable without changing canonical Geography.

### GEO-INV-021

Serviceability defaults to deny/manual review when trustworthy coverage cannot be established.

### GEO-INV-022

Customer-facing Checkout hides provider geography complexity.

### GEO-INV-023

Courier Booking revalidates current provider geography/serviceability rather than trusting stale Checkout data.

### GEO-INV-024

Provider geography IDs are scoped to the relevant Integration Account/provider.

### GEO-INV-025

Postal Code is not assumed to map one-to-one to District/Upazila.

### GEO-INV-026

Coordinates never claim greater accuracy than their source supports.

### GEO-INV-027

Exact customer coordinates remain protected Address data.

### GEO-INV-028

Area hierarchy cannot contain cycles.

### GEO-INV-029

Canonical geography changes are privileged and audited.

### GEO-INV-030

Analytics distinguishes canonical geographic dimensions from courier operational zones.

### GEO-INV-031

Organization-specific operational localities cannot mutate global official areas.

### GEO-INV-032

Serviceability rules have deterministic specificity and exclusion behavior.

### GEO-INV-033

Emergency serviceability overrides do not rewrite historical Orders.

### GEO-INV-034

Address resolution quality remains visible rather than silently treated as perfect.

### GEO-INV-035

Provider mapping and serviceability failures are repairable without manual database edits.

---

# 278. Mandatory V1 Scope

```text
✓ Canonical Geography

✓ Typed geographic areas

✓ Division

✓ District

✓ Upazila

✓ Thana

✓ City Corporation

✓ Municipality

✓ Union

✓ Ward

✓ Locality

✓ Village foundation

✓ Parent hierarchy

✓ Bangla/English names

✓ Aliases

✓ External government/BBS reference codes

✓ Geography dataset versions

✓ Historical/renamed Area handling

✓ Address normalization

✓ Address resolution

✓ Resolution confidence

✓ Unresolved Address support

✓ Customer Address geography references

✓ Order Address snapshots

✓ Delivery Address snapshots

✓ Postal Areas

✓ Postal Area links

✓ Provider Areas

✓ Provider Geography Sync

✓ Provider Area Mapping

✓ Mapping confidence/status

✓ Mapping review queue

✓ Service Areas

✓ Serviceability rules

✓ Explicit exclusions

✓ Temporary overrides

✓ Manual review state

✓ Serviceability explanations

✓ Storefront Area search

✓ Admin Geography tools

✓ Audit

✓ Health checks

✓ Analytics dimensions
```

---

# 279. Strongly Preferred V1

```text
✓ Geography autocomplete

✓ Bangla + English search

✓ Provider mapping-health dashboard

✓ Unmapped-area queue

✓ Geography dataset import/diff tool

✓ Postal-code suggestions

✓ Address quality indicators

✓ Successful-delivery verification signal

✓ Serviceability projection/cache

✓ Provider geography stale-data alerts

✓ Impact preview for canonical Area changes
```

---

# 280. Explicitly Deferred

```text
Full GIS polygons

Route planning

Turn-by-turn geocoding

Own mapping engine

Exact building database

Land parcel data

Mouza-level operational use unless required

Real-time traffic

Map-based courier dispatch

Geofence delivery

Address AI enrichment

Automatic transliteration authority

International address templates for every country

Tax-jurisdiction GIS

Offline maps
```

---

# 281. Decisions Established

### Decision GEO-001

**Human Address text, canonical Geography, postal geography and courier provider geography are separate concepts.**

### Decision GEO-002

**Maevelle uses internal stable IDs for canonical Geography; external government/provider codes remain mappings/references.**

### Decision GEO-003

**Bangladesh geography is represented using typed nodes rather than one hard-coded Division→District→Upazila→Union schema.**

### Decision GEO-004

**The canonical model supports both urban and rural geographic structures.**

### Decision GEO-005

**Aliases support Bangla, English, legacy and common place names without creating duplicate Areas.**

### Decision GEO-006

**Official geography imports are versioned and reviewed before publication.**

### Decision GEO-007

**Historical Areas are retained rather than deleted.**

### Decision GEO-008

**Customer Checkout uses simplified progressive address entry rather than exposing the full administrative hierarchy.**

### Decision GEO-009

**Unresolved locality text is allowed and preserved.**

### Decision GEO-010

**Low-confidence address matches never silently become authoritative.**

### Decision GEO-011

**Postal Code data is modeled separately from administrative Geography.**

### Decision GEO-012

**Courier providers maintain their own imported Provider Area datasets.**

### Decision GEO-013

**Provider Area Mapping is explicit, version-aware and auditable.**

### Decision GEO-014

**Provider geography changes never rewrite historical Courier Booking data.**

### Decision GEO-015

**Delivery Serviceability is its own operational decision and does not change canonical Geography.**

### Decision GEO-016

**Serviceability rules support explicit inclusions, descendants, exclusions and temporary overrides.**

### Decision GEO-017

**Serviceability defaults safely when coverage cannot be established.**

### Decision GEO-018

**Checkout does not need a live courier API for every address lookup where local verified coverage data is sufficient.**

### Decision GEO-019

**Courier Booking performs final current provider mapping/serviceability validation.**

### Decision GEO-020

**Exact coordinates are optional in V1 and never fabricated from broad-area centroids.**

---

# 282. Schema Refinements Required

Create:

```text
geography.geographic_areas

geography.area_aliases

geography.area_source_references

geography.geography_dataset_versions

geography.area_successors

geography.postal_areas

geography.postal_area_links

geography.provider_areas

geography.provider_area_mappings

geography.provider_geography_syncs

geography.service_areas

geography.service_area_members

geography.serviceability_rules

geography.serviceability_overrides
```

Optional projection:

```text
geography.serviceability_projection
```

---

# 283. Customer Schema Refinement

`customers.customer_addresses` should stop treating:

```text
area
city
district
```

as the only geographic truth.

Add canonical references while preserving human text.

---

# 284. Order Schema Refinement

`orders.order_addresses` should preserve:

```text
canonical IDs
+
canonical names
+
human text
+
postal code
+
address resolution quality
```

as immutable snapshot data.

---

# 285. Delivery Schema Refinement

`delivery.deliveries`/Courier Booking should separate:

```text
Maevelle Address Snapshot
```

from:

```text
Provider Geography Snapshot.
```

---

# 286. Warehouse Refinement

`warehouse.locations` can replace opaque-only:

```text
address_json
```

with:

```text
structured address
+
canonical geography references
```

while retaining bounded metadata JSON where useful.

---

# 287. Procurement Refinement

Supplier Addresses should reuse Geography/Address concepts rather than having a separate uncontrolled country/city vocabulary.

---

# 288. API Refinement

Add shared API contracts:

```text
GeographicAreaSummary

AddressInput

ResolvedAddress

AddressSnapshot

PostalArea

ServiceabilityResult

DeliveryOption
```

---

# 289. Architecture Milestone

We now have a complete path from customer location to courier provider without coupling customer data to the courier:

```text
CUSTOMER INPUT
      ↓
ADDRESS
      ↓
CANONICAL GEOGRAPHY
      ↓
SERVICEABILITY
      ↓
PROVIDER AREA MAPPING
      ↓
DELIVERY PROVIDER
      ↓
COURIER BOOKING
```

and historical truth remains:

```text
ORDER ADDRESS SNAPSHOT
          │
          └── unchanged forever
```

even if:

```text
Customer Address changes

Area renamed

Provider Area ID changes

Courier provider changes.
```

---

# 290. Foundational Domain Architecture Status

With Geography completed, the major transactional and operational foundation now includes:

```text
Catalog

Sizing

Media

Pricing

Promotions

Inventory

Warehouse

Procurement

Inbound Shipment

Landed Cost

Costing / COGS

Customers

Orders

Payments

Finance

Reviews

Notifications

Analytics

Settings

Returns

Delivery

Geography

IAM / Access Control

API / Webhooks / Integrations

Security

Technical Architecture

PostgreSQL Schema

Application Commands & Queries

OpenAPI Contract
```

At this stage, continuing to discover broad new domains would have diminishing value.

Unknown future capabilities should now be handled through:

```text
explicit deferred scope

ADRs

implementation discoveries
```

rather than endlessly postponing implementation.

---

# 291. Next Phase

We should now move from **business/system modeling** into **product information architecture**.

The next document should be:

```text
docs/product/admin-information-architecture.md
```

---

# 292. Why Admin Information Architecture Next?

We now know what the platform can do.

The next challenge is:

> **How do we expose all this power without creating an unusable ERP-style admin panel?**

The Admin Portal needs to organize:

```text
Dashboard

Orders

Deliveries

Returns

Customers

Products

Categories

Collections

Media

Inventory

Warehouses

Purchasing

Inbound Shipments

Receiving

Landed Cost

Costing / Margin

Payments

Finance

Reviews

Promotions

Analytics

Notifications

Integrations

Team & Access

Settings

Integrity / Exceptions
```

without overwhelming ordinary users.

---

# 293. Admin Architecture Questions

The next document should settle:

```text
Sidebar hierarchy

Primary vs secondary modules

Dashboard hierarchy

Command center

Global search

Quick actions

Tables

Filters

Saved views

Status representation

Bulk actions

Detail workspaces

Timeline pattern

Exception queues

Operational inbox

Forms

Draft/autosave

Unsaved changes

Optimistic concurrency UX

Permission-aware navigation

Sensitive data masking

Mobile/tablet behavior

Keyboard shortcuts

Breadcrumbs

Cross-domain links

Notifications

Integrity warnings

Repair UX

Light/Dark theme

Accessibility

shadcn/ui component conventions
```

---

# 294. Central Admin UX Principle

The next architecture should follow:

> **Expose complexity progressively: show the user's next decision first, supporting context second, and deep system detail only when needed.**

For example:

```text
Order Workspace

[What needs attention]
        ↓
Customer / Payment / Delivery summary
        ↓
Actions
        ↓
Lines
        ↓
Timeline
        ↓
Audit / raw integration detail
```

rather than dumping every database field on one page.

---

# 295. Recommended Sequence From Here

```text
Admin Information Architecture
        ↓
Storefront UX Architecture
        ↓
Testing Master Plan
        ↓
Operations & Incident Runbooks
        ↓
Implementation Roadmap
        ↓
Repository Bootstrap
        ↓
Migrations + Code
```

This is the point where Maevelle should transition from **discovering what the platform is** to **designing exactly how people will operate it**.

---

**End of Geography, Address & Serviceability Architecture v0.1**
