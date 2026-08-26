'use client';

import { FileImage, ImagePlus, LockKeyhole, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { OperationalFeedback, OperationalPageHeader } from '../../components/operational-worklist';
import { StatusBadge } from '../../components/status-badge';

type UploadedAsset = {
  readonly id: string;
  readonly mimeType?: string;
  readonly byteSize?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly visibility?: string;
};

export default function MediaPage() {
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<readonly UploadedAsset[]>([]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('image');
    if (!(file instanceof File) || file.size === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/media/images', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': file.type,
          'x-media-visibility': String(data.get('visibility') ?? 'private'),
        },
        body: file,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string } | string;
        };
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : (body.error?.message ??
                'Upload was rejected. Use a JPEG, PNG, or WebP image within the configured size limit.'),
        );
      }
      const payload = (await response.json()) as { data: UploadedAsset };
      setUploaded((current) => [payload.data, ...current]);
      setMessage(
        `Asset ${payload.data.id} uploaded. Attach it from a product workspace before publishing.`,
      );
      setTone('success');
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Catalog / Assets"
          title="Media library"
          description="Validate and upload product imagery, keep new assets private by default, then attach them through an explicit catalog workflow."
          actions={
            <Link className="button secondary" href="/products">
              Open product workspace
            </Link>
          }
        />
        <section className="media-workspace">
          <form className="panel media-upload" onSubmit={(event) => void upload(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">New asset</p>
                <h2>Upload image</h2>
              </div>
              <ImagePlus aria-hidden="true" />
            </div>
            <label htmlFor="media-image">Image file</label>
            <label className="file-drop" htmlFor="media-image">
              <FileImage aria-hidden="true" />
              <strong>Choose a JPEG, PNG, or WebP image</strong>
              <span>File signatures and configured size limits are validated by the server.</span>
              <input
                id="media-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <label htmlFor="media-visibility">Initial visibility</label>
            <select id="media-visibility" name="visibility" defaultValue="private">
              <option value="private">Private — recommended for new uploads</option>
              <option value="public">Public — available to customer-facing media routes</option>
            </select>
            <OperationalFeedback tone="warning">
              Public visibility does not attach an asset to a product. Catalog publication remains a
              separate server-authorized action.
            </OperationalFeedback>
            <button className="button primary" disabled={busy} type="submit">
              <ImagePlus aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload asset'}
            </button>
          </form>
          <aside className="panel media-policy">
            <p className="eyebrow">Safety policy</p>
            <h2>Controlled asset lifecycle</h2>
            <div>
              <LockKeyhole aria-hidden="true" />
              <span>
                <strong>Private by default</strong>
                <small>
                  Unpublished assets are served only through the authenticated Admin route.
                </small>
              </span>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>Content validated</strong>
                <small>
                  MIME type is derived from the file signature, not trusted request metadata.
                </small>
              </span>
            </div>
            <div>
              <FileImage aria-hidden="true" />
              <span>
                <strong>Catalog-owned placement</strong>
                <small>
                  Role, product, variant, and ordering are assigned by catalog commands.
                </small>
              </span>
            </div>
          </aside>
        </section>
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">This session</p>
              <h2>Recently uploaded</h2>
            </div>
            <span className="result-count">
              {uploaded.length} asset{uploaded.length === 1 ? '' : 's'}
            </span>
          </div>
          {uploaded.length ? (
            <div className="media-grid">
              {uploaded.map((asset) => (
                <article key={asset.id}>
                  <div className="media-preview">
                    <Image
                      src={`/api/admin/media/${asset.id}`}
                      alt="Recently uploaded Admin media asset"
                      width={320}
                      height={240}
                      unoptimized
                    />
                  </div>
                  <div>
                    <strong>{asset.id}</strong>
                    <StatusBadge status={asset.visibility ?? 'PRIVATE'} />
                    <p>
                      {asset.mimeType ?? 'Image'}
                      {asset.widthPx && asset.heightPx
                        ? ` · ${asset.widthPx} × ${asset.heightPx}`
                        : ''}
                      {asset.byteSize ? ` · ${Math.ceil(asset.byteSize / 1024)} KB` : ''}
                    </p>
                    <small>
                      Use the product workspace to assign thumbnail, gallery, color, or size-diagram
                      role.
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <FileImage aria-hidden="true" />
              <strong>No uploads in this session</strong>
              <p>Successfully uploaded assets appear here for immediate review.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
