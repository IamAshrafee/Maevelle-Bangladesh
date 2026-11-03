# Wishlist recovery keys

Phase 07A.1 implementation; all rehearsals use generated temporary roots and disposable PostgreSQL 18. No production key or persistent ciphertext was changed. This is an operational procedure requiring a separately authorized target; the bundled CLI deliberately accepts only the local acceptance database.

## Consumers and compatibility

`AUTH_ENCRYPTION_KEY` remains mandatory and unchanged. Source audit found:

- Admin and shopper encrypted secondary storage (`apps/api/src/auth/secondary-storage.ts`): security package `v1.<key-id>.<nonce>.<tag>.<ciphertext>` with fixed `v1` key identifier. Session indexes, session payloads and recovery state depend on it. Changing the root makes existing storage unreadable; Wishlist key versioning does not migrate authentication.
- MFA and account/team security consume the same authentication root. Provider adapters in settings, courier/delivery/orders, Meta integrations, notifications and Worker use `runtime-auth-key` and the security package envelope. Key IDs exist, but these consumers do not automatically load historical roots.
- Storefront messaging derives keyed digests from the root. Rotation can change lookup identity as well as decryption.
- Legacy Wishlist uses HKDF-SHA256 (`maevelle:wishlist-share-recovery:v1`) and binary `nonce[12] | tag[16] | JSON ciphertext`. Recoverable fields are `wishlist.shares.view_token_ciphertext` and `wishlist.share_create_receipts.response_ciphertext`. The latter can contain both guest view and management capabilities; it expires after 48 hours and is later nulled while the retry tombstone remains. Older 3208 rows can have no recoverable ciphertext; migration cannot invent missing capabilities.

The existing security utility has version/key IDs but no associated-data parameter or key-ring loader. Wishlist retains its existing AES-256-GCM/HKDF implementation and adds a domain envelope; no cipher/dependency was introduced and no other domain's format changes.

New binary envelope: ASCII `maevelle:share:v2:` (18 bytes), one byte ID length, 1–64 ASCII `[A-Za-z0-9_-]` ID bytes, 12-byte random nonce, 16-byte GCM tag, encrypted JSON. `legacy` is reserved. Header bytes and existing record context (`share-view:<share UUID>` or `share-create:<operation capability>`) are authenticated as AAD. Non-ASCII IDs, unknown IDs, wrong roots, wrong context and failed authentication reject safely. Roots remain 32-byte base64; derived keys stay domain-separated. No plaintext capabilities are added to persistence, logs, inventory output or migration checkpoints.

## Configuration

- `WISHLIST_SHARE_ACTIVE_KEY_ID`: immutable identifier for the active Wishlist root.
- `WISHLIST_SHARE_KEYS`: JSON object mapping IDs to 32-byte base64 roots (at most 20); load through protected secret configuration. Never replace root bytes under an existing ID.
- `WISHLIST_SHARE_READ_LEGACY`: defaults `true` when a ring is configured; includes the unchanged authentication root solely as the legacy Wishlist decryptor.
- `WISHLIST_SHARE_WRITE_LEGACY`: defaults `false` when a ring is configured; explicitly set `true` for reader-first rollout. It requires legacy reads/root. The migration rejects a legacy-writing ring.

With no Wishlist ring variables, behavior remains legacy read/write. This default is compatible with old images but cannot read versioned records. With a ring and `WRITE_LEGACY=true`, the new image reads legacy and versioned records while writing legacy. With `WRITE_LEGACY=false`, all new recoverable data uses the active version; historical IDs stay available for decryption.

API startup checks all retained ciphertext identifiers, including revoked/expired records and unexpired receipts. A missing required ID/legacy decryptor rejects startup. This check detects missing identifiers, not a root replaced under the same ID; verify authenticated decryption during rehearsal. Recovery failures at routes return safe 503 errors and preserve the browser pending creation; they never authorize a new operation ID automatically.

## Controlled rollout and bounded migration

1. Inventory the actual target and all root consumers; retain protected configuration, encrypted database backup and previous image manifest. Verify an isolated restore. No key values in release manifests.
2. Deploy this reader-capable image to every API instance with the same ring, old roots retained and `WRITE_LEGACY=true`. No old image may remain before versioned writes begin. Worker does not decrypt Wishlist recovery; its authentication/provider root remains unchanged.
3. Verify legacy recovery and provider/session continuity. Pause API writers briefly, enable `WRITE_LEGACY=false` on all API instances and resume. Mixed reader-only/new-writing instances are compatible; older legacy-only images are not.
4. Call `reencryptShareRecoveryBatch(db, ring, batch)` with a version-writing ring and a batch between 1 and 500. One transaction locks at most `batch` combined share/receipt records using `FOR UPDATE SKIP LOCKED`. It decrypts/authenticates each source, validates recovered token shape, checks share token against its digest, validates receipt identity/shape, encrypts with the active version, decrypts the result and then updates. It leaves digests, share ownership/version/expiry, audit/outbox, management authority and retry tombstones unchanged.
5. Repeat bounded calls. The envelope is the checkpoint: committed records leave the candidate set; interruption before commit rolls back the batch, interruption between calls preserves prior progress. No cursor with plaintext secrets is persisted. A corrupt or unavailable-key record aborts the current whole batch; retain evidence securely, repair/restore that record using its correct root, then retry. Do not skip it or erase its receipt to obtain a green count.
6. An empty batch can also mean another consumer holds candidates. Quiesce all writers/migration consumers, rerun and call `assertShareRecoveryKeysAvailable` with the proposed retained ring (excluding the candidate retired key). Missing identifiers reject. Verify authenticated recovery and idempotent creation replay with synthetic representative records. Repeat after cleanup races settle. Records already carrying the active ID are not re-encrypted; authenticated read verification remains necessary.
7. Retire only the Wishlist legacy decryptor/previous Wishlist root after zero dependencies, verified recovery, backup/restore and security-owner approval. `AUTH_ENCRYPTION_KEY` remains required for other domains even when Wishlist has no legacy dependencies. Retain escrow for backups for their full approved restore window.

The local-only CLI is `pnpm exec tsx scripts/wishlist-phase07a1-reencrypt.ts 10`; each invocation performs one bounded batch. It uses the positively guarded loopback port 55442/database `maevelle_ui_07a`, generates a mode-0600 root outside Git, and never reads `.env`. Append `--check-retirement` only after quiescing writers and draining candidates. It is a rehearsal tool, not a staging command or authorization.

## Loss, rollback and recovery

| Situation | Actual result / recovery |
|---|---|
| Active Wishlist root lost | Records written under that ID cannot be recovered. New version-writing encryption requires a valid configured active root. Restore protected key material; otherwise select a fresh approved ID and explicitly rotate affected account links. Guest creation receipt loss can prevent recovering an unknown result; do not blindly create another operation. |
| Previous/legacy root lost | Dependent historical ciphertext becomes unreadable; records migrated to retained roots remain recoverable. Restore root escrow or explicitly rotate eligible account links. Guest management credentials already in the browser still authorize guest management independently. |
| Public view token already held | Its digest validation does not use recovery encryption and remains cryptographically valid until revoke/expiry/rotation. However, missing-key startup protection or loss of the mandatory authentication root can prevent the API from starting; do not promise endpoint availability during a key-loss incident. |
| Owner asks to recover existing link | Authenticated ownership plus the matching root is necessary. No matching root means safe recovery failure; explicit account rotation can issue a new link if the service has a valid active root. Rotation invalidates the old link; it is not recovery of it. |
| Roll back before versioned writes | Legacy-only image remains format-compatible, provided authentication configuration/schema/contracts also match. |
| Roll back after versioned writes | Legacy-only images cannot read new envelopes. Roll back only to a reader-capable image retaining every needed root, or forward-repair. No automatic down migration. |
| Backup contains retired IDs | Restore its keys from approved escrow with the backup, then replay the bounded migration; a database backup alone is insufficient. |

No real root was rotated. Production custody/escrow, incident availability and retirement approval remain security-owner gates. An image SHA/digest for this uncommitted work does not yet exist.
