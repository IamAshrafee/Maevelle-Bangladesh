'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

type Finding = {
  domain: string;
  severity: string;
  code: string;
  description: string;
  repairability?: string;
  status?: string;
  detected_at?: string;
};
async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('Integrity operation was rejected.');
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
export function IntegrityConsole() {
  const [findings, setFindings] = useState<readonly Finding[]>([]);
  const [message, setMessage] = useState('Running integrity verifiers…');
  const reload = useCallback(async () => {
    try {
      setFindings((await request<ApiEnvelope<readonly Finding[]>>('/admin/integrity')).data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load integrity findings.');
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const repair = async (projection: 'ANALYTICS' | 'SEARCH') => {
    try {
      await request('/admin/integrity/repairs', {
        method: 'POST',
        body: JSON.stringify({ projection }),
      });
      setMessage(`${projection} projection rebuilt from authoritative source facts.`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Repair was rejected.');
    }
  };
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Operations / Integrity</p>
        <h1>Integrity center</h1>
        <p>
          Transactional truth is diagnosis-only. Repair actions are restricted to documented
          rebuildable projections.
        </p>
        <nav>
          <Link href="/operations">Operations</Link> · <Link href="/analytics">Analytics</Link> ·{' '}
          <Link href="/team">Team & access</Link>
        </nav>
        <p role="status">{message}</p>
        <p>
          <button type="button" onClick={() => void repair('ANALYTICS')}>
            Rebuild Analytics
          </button>{' '}
          <button type="button" onClick={() => void repair('SEARCH')}>
            Rebuild Search projection
          </button>
        </p>
        {findings.length === 0 && !message ? <p>No integrity findings.</p> : null}
        {findings.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Domain</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Repairability</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((finding, index) => (
                  <tr key={`${finding.domain}-${finding.code}-${index}`}>
                    <td>{finding.severity}</td>
                    <td>{finding.domain}</td>
                    <td>{finding.code}</td>
                    <td>{finding.description}</td>
                    <td>{finding.repairability ?? 'DIAGNOSIS_ONLY'}</td>
                    <td>
                      {finding.detected_at
                        ? new Date(finding.detected_at).toLocaleString()
                        : 'Current verification'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
