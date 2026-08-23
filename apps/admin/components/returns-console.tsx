'use client';
import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
type ReturnCase = {
  id: string;
  return_number: string;
  case_type: string;
  case_status: string;
  authorization_status: string;
  receipt_status: string;
  created_at: string;
};
async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('Return command was rejected.');
  return response.json() as Promise<T>;
}
export function ReturnsConsole({ rto = false }: { rto?: boolean }) {
  const [cases, setCases] = useState<readonly ReturnCase[]>([]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    try {
      setCases((await request<ApiEnvelope<readonly ReturnCase[]>>('/admin/returns')).data);
    } catch {
      setMessage('Unable to load reverse logistics. Sign in with Returns permission.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  return (
    <main>
      <section className="shell">
        <h1>{rto ? 'RTO' : 'Returns'}</h1>
        <p>
          Commercial return intent, physical reverse receipt, refund, and cost recovery remain
          separate facts.
        </p>
        {message ? <p role="status">{message}</p> : null}
        {cases
          .filter((x) => (rto ? x.case_type === 'RTO' : x.case_type === 'CUSTOMER_RETURN'))
          .map((item) => (
            <article key={item.id}>
              <h2>{item.return_number}</h2>
              <p>
                {item.case_status} · authorization {item.authorization_status} · receipt{' '}
                {item.receipt_status}
              </p>
              {!rto && item.authorization_status === 'PENDING' ? (
                <button
                  type="button"
                  onClick={() =>
                    void request(`/admin/returns/${item.id}/authorize`, {
                      method: 'POST',
                      body: JSON.stringify({
                        expectedVersion: 1,
                        idempotencyKey: crypto.randomUUID(),
                      }),
                    })
                      .then(reload)
                      .catch(() =>
                        setMessage('Authorization was rejected. Reload before retrying.'),
                      )
                  }
                >
                  Authorize return
                </button>
              ) : null}
            </article>
          ))}
        {cases.length === 0 ? <p>No {rto ? 'RTO cases' : 'customer returns'} yet.</p> : null}
      </section>
    </main>
  );
}
