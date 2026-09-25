'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

export default function SubmitReviewPage() {
  return (
    <Suspense
      fallback={
        <main>
          <section className="shell">
            <p>Loading secure review form…</p>
          </section>
        </main>
      }
    >
      <ReviewSubmissionForm />
    </Suspense>
  );
}

function ReviewSubmissionForm() {
  const search = useSearchParams();
  const organizationId = search.get('organizationId');
  const token = search.get('token');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  if (!organizationId || !token)
    return (
      <main>
        <section className="review-submit-page">
          <h1>Review link unavailable</h1>
          <p>This secure review link is missing or invalid.</p>
        </section>
      </main>
    );

  return (
    <main>
      <section className="review-submit-page">
        <p className="eyebrow">Verified purchase</p>
        <h1>How was your Maevelle experience?</h1>
        <p>
          Your review is submitted for moderation. It cannot be published or rated by the client.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            setSubmitting(true);
            setMessage('');
            const form = new FormData(formElement);
            void (async () => {
              const files = form
                .getAll('media')
                .filter((entry): entry is File => entry instanceof File && entry.size > 0);
              if (files.length > 5) throw new Error('Choose no more than 5 images.');
              const mediaAssetIds: string[] = [];
              for (const [index, file] of files.entries()) {
                setUploadStatus(`Uploading image ${index + 1} of ${files.length}…`);
                mediaAssetIds.push(await uploadReviewImage(file, organizationId, token));
              }
              setUploadStatus(files.length ? 'Submitting your review…' : '');
              const response = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  organizationId,
                  accessToken: token,
                  rating: Number(form.get('rating')),
                  title: form.get('title') || undefined,
                  body: form.get('body') || undefined,
                  mediaAssetIds,
                  idempotencyKey: crypto.randomUUID(),
                }),
              });
              if (!response.ok) throw new Error('Review submission was rejected.');
              setMessage('Thanks. Your review is awaiting approval.');
              formElement.reset();
            })()
              .catch((error: unknown) =>
                setMessage(
                  error instanceof Error
                    ? error.message
                    : 'Review submission was rejected. Please use your secure link.',
                ),
              )
              .finally(() => {
                setUploadStatus('');
                setSubmitting(false);
              });
          }}
        >
          <label>
            Rating
            <select name="rating" defaultValue="5">
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} star{rating === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title <input name="title" maxLength={160} />
          </label>
          <label>
            Review <textarea name="body" maxLength={5000} />
          </label>
          <label>
            Photos (optional, up to 5)
            <input
              name="media"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={submitting}
            />
          </label>
          {uploadStatus ? <p role="status">{uploadStatus}</p> : null}
          <button disabled={submitting} type="submit">
            {submitting ? 'Submitting…' : 'Submit review'}
          </button>
        </form>
        {message ? <p role="status">{message}</p> : null}
      </section>
    </main>
  );
}

async function uploadReviewImage(file: File, organizationId: string, accessToken: string) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Review photos must be JPEG, PNG, or WebP images.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Each Review photo must be 5 MB or smaller.');
  const sessionResponse = await fetch('/api/reviews/media/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      organizationId,
      accessToken,
      filename: file.name,
      mimeType: file.type,
      byteSize: file.size,
    }),
  });
  if (!sessionResponse.ok) throw new Error('A Review photo upload could not be authorized.');
  const session = (await sessionResponse.json()) as {
    data: {
      sessionId: string;
      assetId: string;
      upload: {
        strategy: 'SIGNED_PUT' | 'API_PROXY';
        url: string;
        method: 'PUT';
        headers: Record<string, string>;
      };
    };
  };
  const uploadHeaders = new Headers(session.data.upload.headers);
  if (session.data.upload.strategy === 'API_PROXY')
    uploadHeaders.set('x-review-access-token', accessToken);
  const uploadResponse = await fetch(session.data.upload.url, {
    method: 'PUT',
    headers: uploadHeaders,
    body: file,
  });
  if (!uploadResponse.ok) throw new Error('A Review photo could not be uploaded.');
  const completionResponse = await fetch(
    `/api/reviews/media/uploads/${session.data.sessionId}/complete`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, accessToken }),
    },
  );
  if (!completionResponse.ok) throw new Error('A Review photo could not be verified.');
  const timeoutAt = Date.now() + 90_000;
  while (Date.now() < timeoutAt) {
    const statusResponse = await fetch(
      `/api/reviews/media/${session.data.assetId}/status?organizationId=${encodeURIComponent(organizationId)}`,
      { headers: { 'x-review-access-token': accessToken }, cache: 'no-store' },
    );
    if (!statusResponse.ok) throw new Error('A Review photo status could not be verified.');
    const status = (await statusResponse.json()) as {
      data: { status: string; errorMessage: string | null };
    };
    if (status.data.status === 'READY') return session.data.assetId;
    if (['FAILED', 'QUARANTINED'].includes(status.data.status))
      throw new Error(status.data.errorMessage ?? 'A Review photo failed safety processing.');
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  throw new Error('A Review photo is still processing. Please try again shortly.');
}
