'use client';

import { KeyRound, RefreshCw, ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from './operational-worklist';
import { StatusBadge } from './status-badge';

type Member = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly two_factor_enabled: boolean;
  readonly membership_type: string;
  readonly status: string;
  readonly created_at: string;
  readonly capabilities: readonly string[];
};
type Capability = {
  readonly capability_code: string;
  readonly domain: string;
  readonly description: string;
  readonly sensitivity: string;
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string };
    };
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? 'Team operation was rejected.'),
    );
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export function TeamConsole() {
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [capabilities, setCapabilities] = useState<readonly Capability[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedCapability, setSelectedCapability] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [teamResponse, capabilityResponse] = await Promise.all([
        request<{ data: readonly Member[] }>('/admin/team'),
        request<{ data: readonly Capability[] }>('/admin/team/capabilities'),
      ]);
      setMembers(teamResponse.data);
      setCapabilities(capabilityResponse.data);
      setSelectedId((current) => current || teamResponse.data[0]?.id || '');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load team access.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const worklist = useOperationalWorklist({
    items: members,
    storageKey: 'admin-team',
    getSearchText: (member) =>
      `${member.name} ${member.email} ${member.membership_type} ${member.capabilities.join(' ')}`,
    getStatus: (member) => member.status,
    getReference: (member) => member.name,
    getTimestamp: (member) => member.created_at,
  });
  const selected = useMemo(
    () => members.find((member) => member.id === selectedId),
    [members, selectedId],
  );
  const availableCapabilities = useMemo(
    () => capabilities.filter((item) => !selected?.capabilities.includes(item.capability_code)),
    [capabilities, selected],
  );

  async function change(memberId: string, body: object, success: string) {
    setBusy(true);
    try {
      await request(`/admin/team/${memberId}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMessage(success);
      setTone('success');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Team change was rejected.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Settings / Identity"
          title="Team and access"
          description="Review organization membership, MFA posture, and explicit server-enforced capabilities."
          actions={
            <button className="button secondary" type="button" onClick={() => void reload()}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <section className="metric-strip">
          <article>
            <span>Members</span>
            <strong>{members.length}</strong>
            <small>current organization</small>
          </article>
          <article>
            <span>Active</span>
            <strong>{members.filter((member) => member.status === 'ACTIVE').length}</strong>
            <small>can authenticate</small>
          </article>
          <article>
            <span>MFA enabled</span>
            <strong>{members.filter((member) => member.two_factor_enabled).length}</strong>
            <small>account security</small>
          </article>
          <article>
            <span>Owners</span>
            <strong>{members.filter((member) => member.membership_type === 'OWNER').length}</strong>
            <small>protected memberships</small>
          </article>
        </section>
        <OperationalWorklistToolbar
          query={worklist.query}
          onQueryChange={worklist.setQuery}
          status={worklist.status}
          onStatusChange={worklist.setStatus}
          statuses={['ACTIVE', 'DISABLED']}
          sort={worklist.sort}
          onSortChange={worklist.setSort}
          density={worklist.density}
          onDensityChange={worklist.setDensity}
          resultCount={worklist.visibleItems.length}
          savedViews={worklist.savedViews}
          onSaveView={worklist.saveView}
          onApplyView={worklist.applyView}
          searchLabel="Search name, email, role, or capability"
        />
        <section
          className={selected ? 'operational-workspace detail-open' : 'operational-workspace'}
        >
          <div className="panel worklist-panel">
            {loading ? (
              <div className="skeleton-list" aria-label="Loading team">
                <span />
                <span />
                <span />
              </div>
            ) : worklist.visibleItems.length ? (
              <div className="data-table-shell">
                <table className={worklist.density === 'compact' ? 'density-compact' : ''}>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>MFA</th>
                      <th className="numeric">Capabilities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worklist.visibleItems.map((member) => (
                      <tr key={member.id} onClick={() => setSelectedId(member.id)}>
                        <td>
                          <button
                            className="table-primary-action"
                            type="button"
                            onClick={() => setSelectedId(member.id)}
                          >
                            <strong>{member.name}</strong>
                            <small>{member.email}</small>
                          </button>
                        </td>
                        <td>{member.membership_type}</td>
                        <td>
                          <StatusBadge status={member.status} />
                        </td>
                        <td>
                          <StatusBadge
                            status={member.two_factor_enabled ? 'ENABLED' : 'DISABLED'}
                          />
                        </td>
                        <td className="numeric">{member.capabilities.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <OperationalEmptyState
                title="No matching team members"
                description="Clear the active filters to review organization access."
              />
            )}
          </div>
          {selected ? (
            <aside className="operational-detail">
              <div className="detail-body">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Access detail</p>
                    <h2>{selected.name}</h2>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <dl className="detail-facts">
                  <div>
                    <dt>Email</dt>
                    <dd>{selected.email}</dd>
                  </div>
                  <div>
                    <dt>Membership</dt>
                    <dd>{selected.membership_type}</dd>
                  </div>
                  <div>
                    <dt>MFA</dt>
                    <dd>{selected.two_factor_enabled ? 'Enabled' : 'Not enabled'}</dd>
                  </div>
                </dl>
                {selected.membership_type === 'OWNER' ? (
                  <OperationalFeedback tone="warning">
                    <ShieldCheck aria-hidden="true" /> Owner membership and grants are protected
                    from this workspace.
                  </OperationalFeedback>
                ) : (
                  <>
                    <section>
                      <h3>Granted capabilities</h3>
                      {selected.capabilities.length ? (
                        <ul className="capability-list">
                          {selected.capabilities.map((code) => {
                            const definition = capabilities.find(
                              (item) => item.capability_code === code,
                            );
                            return (
                              <li key={code}>
                                <span>
                                  <strong>{code}</strong>
                                  <small>
                                    {definition?.description ?? 'Organization capability'} ·{' '}
                                    {definition?.sensitivity ?? 'INTERNAL'}
                                  </small>
                                </span>
                                <button
                                  className="button secondary"
                                  disabled={busy}
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Revoke ${code} from ${selected.name}?`))
                                      void change(
                                        selected.id,
                                        { revoke: code },
                                        `${code} revoked from ${selected.name}.`,
                                      );
                                  }}
                                >
                                  Revoke
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p>No direct capability grants.</p>
                      )}
                    </section>
                    <section className="inset-form">
                      <h3>
                        <KeyRound aria-hidden="true" /> Grant capability
                      </h3>
                      <label>
                        Capability
                        <select
                          value={selectedCapability}
                          onChange={(event) => setSelectedCapability(event.target.value)}
                        >
                          <option value="">Choose a capability</option>
                          {availableCapabilities.map((item) => (
                            <option key={item.capability_code} value={item.capability_code}>
                              {item.domain} — {item.capability_code} ({item.sensitivity})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button primary"
                        disabled={busy || !selectedCapability}
                        type="button"
                        onClick={() =>
                          void change(
                            selected.id,
                            { grant: selectedCapability },
                            `${selectedCapability} granted to ${selected.name}.`,
                          )
                        }
                      >
                        Grant selected capability
                      </button>
                    </section>
                    <section className="detail-actions">
                      <button
                        className="button secondary"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          const nextStatus = selected.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
                          if (
                            nextStatus === 'ACTIVE' ||
                            window.confirm(
                              `Disable access for ${selected.name}? Existing sessions may remain subject to the authentication revocation policy.`,
                            )
                          )
                            void change(
                              selected.id,
                              { status: nextStatus },
                              `${selected.name} is now ${nextStatus.toLowerCase()}.`,
                            );
                        }}
                      >
                        {selected.status === 'ACTIVE' ? (
                          <UserRoundX aria-hidden="true" />
                        ) : (
                          <UserRoundCheck aria-hidden="true" />
                        )}
                        {selected.status === 'ACTIVE' ? 'Disable member' : 'Reactivate member'}
                      </button>
                    </section>
                  </>
                )}
              </div>
            </aside>
          ) : null}
        </section>
      </section>
    </main>
  );
}
