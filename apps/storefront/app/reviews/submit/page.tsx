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

  if (!organizationId || !token)
    return (
      <main>
        <section className="shell">
          <h1>Review link unavailable</h1>
          <p>This secure review link is missing or invalid.</p>
        </section>
      </main>
    );

  return (
    <main>
      <section className="shell">
        <h1>Share your verified purchase experience</h1>
        <p>
          Your review is submitted for moderation. It cannot be published or rated by the client.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void fetch('/api/reviews', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                organizationId,
                accessToken: token,
                rating: Number(form.get('rating')),
                title: form.get('title') || undefined,
                body: form.get('body') || undefined,
                idempotencyKey: crypto.randomUUID(),
              }),
            })
              .then((response) => {
                if (!response.ok) throw new Error('Review submission was rejected.');
                setMessage('Thanks. Your review is awaiting approval.');
                event.currentTarget.reset();
              })
              .catch(() =>
                setMessage('Review submission was rejected. Please use your secure link.'),
              );
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
          <button type="submit">Submit review</button>
        </form>
        {message ? <p role="status">{message}</p> : null}
      </section>
    </main>
  );
}
