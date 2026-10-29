import { afterAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { createDatabase, sql } from '@maevelle/database';
import { registerUploadedMedia } from '@maevelle/database/media';
import { createOrganization } from '@maevelle/database/platform';
import type { ObjectStoragePort } from '@maevelle/media';

import type { createAuth } from '../auth/auth.js';
import { registerMediaRoutes } from './media.js';

const database = createDatabase({ connectionString: process.env.TEST_DATABASE_URL!, maxConnections: 2 });
afterAll(async () => database.close());

describe('public media cache identity', () => {
  it('redirects stable URLs to the current bytes and rejects replaced or withdrawn versions', async () => {
    const organization = await createOrganization(database.db, {
      code: `media-cache-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Media cache test', timezone: 'UTC', defaultLocale: 'en', defaultCurrency: 'BDT',
    });
    const asset = await registerUploadedMedia(database.db, {
      organizationId: organization.id, objectKey: 'cache/source.jpg', mimeType: 'image/jpeg',
      byteSize: 2, checksumSha256: 'f'.repeat(64), visibility: 'PUBLIC',
    });
    const original = await sql<{ current_object_id: string }>`select current_object_id::text
      from media.media_assets where id=${asset.id}::uuid`.execute(database.db);
    await sql`insert into media.media_renditions
      (organization_id,asset_id,source_object_id,rendition_key,storage_provider,bucket_name,
       object_key,mime_type,byte_size,checksum_sha256,width_px,height_px,processor_version)
      values (${organization.id},${asset.id},${original.rows[0]!.current_object_id},'card',
        'local','public','cache/v1.webp','image/webp',2,${'a'.repeat(64)},100,100,'test')`
      .execute(database.db);

    let objectAvailable = true;
    const storage = {
      provider: 'local', privateBucket: 'private', publicBucket: 'public',
      createSignedUpload: async () => { throw new Error('Unused'); },
      createSignedRead: async () => null,
      put: async () => {},
      get: async ({ key }: { key: string }) => objectAvailable
        ? Buffer.from(key === 'cache/v1.webp' ? 'v1' : 'v2') : undefined,
      head: async () => undefined,
      probe: async () => undefined,
      delete: async () => {},
    } as ObjectStoragePort;
    const app = Fastify();
    registerMediaRoutes(app, database, {} as ReturnType<typeof createAuth>, storage,
      { maxUploadBytes: 10 * 1024 * 1024, uploadExpirySeconds: 900 });

    const stablePath = `/media/public/${asset.id}?rendition=card`;
    const stable = await app.inject({ method: 'GET', url: stablePath });
    expect(stable.statusCode).toBe(302);
    expect(stable.headers.location).toBe(`?rendition=card&v=${'a'.repeat(64)}`);
    expect(stable.headers['cache-control']).toBe('no-store');

    const oldPath = `${stablePath}&v=${'a'.repeat(64)}`;
    const first = await app.inject({ method: 'GET', url: oldPath });
    expect(first.statusCode).toBe(200);
    expect(first.body).toBe('v1');
    expect(first.headers['cache-control']).toBe('public, max-age=300');
    expect(first.headers.etag).toBe(`"${'a'.repeat(64)}"`);
    const validated = await app.inject({ method: 'GET', url: oldPath,
      headers: { 'if-none-match': `"${'a'.repeat(64)}"` } });
    expect(validated.statusCode).toBe(304);

    await sql`update media.media_renditions set object_key='cache/v2.webp',
      checksum_sha256=${'b'.repeat(64)},created_at=now()
      where asset_id=${asset.id}::uuid and rendition_key='card'`.execute(database.db);
    const refreshed = await app.inject({ method: 'GET', url: stablePath });
    expect(refreshed.headers.location).toBe(`?rendition=card&v=${'b'.repeat(64)}`);
    expect((await app.inject({ method: 'GET', url: oldPath,
      headers: { 'if-none-match': `"${'a'.repeat(64)}"` } })).statusCode).toBe(404);
    objectAvailable = false;
    const missing = await app.inject({ method: 'GET', url: `${stablePath}&v=${'b'.repeat(64)}` });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['cache-control']).toBe('no-store');
    objectAvailable = true;

    await sql`update media.media_renditions set storage_provider='s3',bucket_name='public'
      where asset_id=${asset.id}::uuid and rendition_key='card'`.execute(database.db);
    const signedReadOptions: { expiresInSeconds: number; cacheControl?: string }[] = [];
    const s3Storage = {
      ...storage, provider: 's3',
      createSignedRead: async (_locator: unknown, input: { expiresInSeconds: number; cacheControl?: string }) => {
        signedReadOptions.push(input);
        return 'https://storage.example/signed';
      },
    } as ObjectStoragePort;
    const s3App = Fastify();
    registerMediaRoutes(s3App, database, {} as ReturnType<typeof createAuth>, s3Storage,
      { maxUploadBytes: 10 * 1024 * 1024, uploadExpirySeconds: 900 });
    const signed = await s3App.inject({ method: 'GET',
      url: `${stablePath}&v=${'b'.repeat(64)}`,
      headers: { 'if-none-match': `"${'b'.repeat(64)}"` } });
    expect(signed.statusCode).toBe(302);
    expect(signed.headers.location).toBe('https://storage.example/signed');
    expect(signed.headers['cache-control']).toBe('public, max-age=60');
    expect(signedReadOptions).toEqual([{ expiresInSeconds: 300, cacheControl: 'public, max-age=300' }]);
    await s3App.close();

    await sql`update media.media_assets set visibility_class='PRIVATE' where id=${asset.id}::uuid`
      .execute(database.db);
    const withdrawn = await app.inject({ method: 'GET', url: `${stablePath}&v=${'b'.repeat(64)}` });
    expect(withdrawn.statusCode).toBe(404);
    expect(withdrawn.headers['cache-control']).toBe('no-store');
    await app.close();
  });
});
