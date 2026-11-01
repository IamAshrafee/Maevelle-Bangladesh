# Wishlist analytics metric dictionary

All metrics are organization-scoped. No customer filters, owner IDs, contact details,
credentials, purchase, revenue, or unique-human claims are supported. Current state is
as of query time and ignores the selected historical range. Historical ranges use
inclusive ISO `from`/`to` local dates, organization timezone, maximum 90 days. UTC
instants are stored; PostgreSQL performs local bucketing. Category attribution uses
only the current canonical primary category, including for historical activity.

| Metric ID / response field | Meaning and exact formula | Source / grain | Population and limitations |
| --- | --- | --- | --- |
| wishlist.current.savedItems | count account_items | Domain / saved row | Persisted account lists only |
| wishlist.current.lists | count account_lists including empty | Domain / list | Created account lists, not every registered account |
| wishlist.current.nonemptyLists | count distinct wishlist_id in account_items | Domain / list | Account only |
| wishlist.current.distinctProducts | count distinct product_id | Domain / product | Account only |
| wishlist.current.availableItems | count saved rows with active published product and search document available=true | Domain + catalog/search / row | Projection freshness applies |
| wishlist.current.outOfStockItems | same eligibility with available=false | Domain + catalog/search / row | Missing search documents excluded |
| wishlist.current.unavailableItems | total minus previous two | Domain + catalog/search / row | Includes unpublished, inactive, missing search documents |
| wishlist.product.saved | count current saved rows per product | Domain / product | Ranked saved desc, ID asc; aggregate only |
| wishlist.category.saved | count current saved rows by current primary category | Domain / category | Single attribution; null is Uncategorized |
| wishlist.activity.saved | count wishlist.item.saved | Outbox projection / transition | Includes manual and merge insertion, never preference edits |
| wishlist.activity.removed | count wishlist.item.removed | Outbox projection / transition | Actual command deletions; excludes privacy/catalog cascade |
| wishlist.activity.mergeAdditions | count saved where source=MERGE | Outbox projection / transition | Subset of saved, never added again to total |
| wishlist.activity.net | saved-removed | Projection / local day | Activity, not reconciliation of current state |
| wishlist.activity.merges | count wishlist.merge.completed | Projection / committed merge | Includes zero-addition successful merge; receipt replay excluded |
| wishlist.share.created | count wishlist.share.created | Projection / created share | Guest/account origin fixed at creation |
| wishlist.share.origin | created counts filtered origin GUEST/ACCOUNT | Projection / created share | Claim never rewrites creation origin |
| wishlist.share.scope | created counts filtered scope ALL/SELECTED/UNKNOWN | Projection / created share | Guest clients currently omit scope: UNKNOWN; never infer old classification |
| wishlist.share.averageSize | avg snapshot_size for created events | Projection / created share | Original public snapshot size, not current hydrated size |
| wishlist.share.active | count unrevoked shares with expires_at>now | Domain / share | Current retained rows |
| wishlist.share.revoked | count retained rows with revoked_at not null | Domain / share | Mutually exclusive with expired; purge removes current record |
| wishlist.share.expired | count retained unrevoked rows with expires_at<=now | Domain / share | Expiration event uses server expiry timestamp, not cleanup time |
| wishlist.share.guestOwned/accountOwned | count retained rows by current owner nullability | Domain / share | Claim changes current ownership only |
| wishlist.share.claimed/revoked/expiry_changed/link_rotated/expired | count corresponding committed event | Projection / transition | Desired-state no-ops excluded; expired processed before purge |
| wishlist.observation.{name} | count consented storefront events by allowlisted name | Behavioral / observation | Self-reported consent; bots, forged clients and repeats with new IDs possible |
| wishlist.operations.{operation}.{outcome} | count HTTP responses or Worker runs by bounded labels | Operations / local day | Operational attempts, not committed transitions; best effort |
| wishlist.operations.duration | sum response duration_ms | Operations / label/day | Total, not percentile or histogram |
| wishlist.processing.pendingEvents | count Wishlist outbox rows lacking wishlist_v1 receipt | Outbox / pending row | All pending including failed versions |
| wishlist.processing.oldestPendingAt | min occurred_at of pending rows | Outbox / instant | Null when empty; not unique-worker lag |
| wishlist.cleanup.expiredUnreported | count expired unrevoked shares without expiration marker | Domain / share | Worker backlog |
| wishlist.cleanup.purgeableShares | count coalesce(revoked_at,expires_at)<now-30d | Domain / share | Existing lifecycle retention |
| wishlist.cleanup.expiredMergeReceipts | count merge receipts expires_at<now | Domain / receipt | Existing lifecycle retention |

Current-state metrics require no behavioral consent and have complete current coverage.
Domain outcomes require no behavioral consent, begin at migration 3212, and are never
backfilled from current rows. Facts retain 400 days; completeness is false if the range
starts before instrumentation/retention or projection is lagging/failed. Atomic projection
receipts and fact PK deduplicate Worker retry. Domain transactions suppress no-op events.
Outbox retains minimal non-owner payload under existing platform policy; receipt retention
must cover outbox lifetime. Behavioral observations require existing analytics=GRANTED,
use `(organization,eventId)` deduplication and retain 90 days; this is a proposed operational
default, not a legal approval. Old event IDs must not be replayed after retention (event age
is limited to 24h). Operational buckets retain 400 days and have no user linkage.

Unavailable (return metadata, never zero-as-proof): complete guest Wishlist inventory,
qualified/unique recipient engagement, verified share-attributed successful/already-saved/
failed/unresolved saves, per-share conversion, pre-instrumentation activity. Save One/All
initiation and recipient viewed are unverified observations only. Generic authenticated
new saves are authoritative but do not establish share attribution. No attribution token
is introduced, so expiry/account-switch/forged-context paths are rejected as unknown input.
