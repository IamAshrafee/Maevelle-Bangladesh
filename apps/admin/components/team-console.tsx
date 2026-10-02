'use client';

import { KeyRound, RefreshCw, ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from './operational-worklist';
import { StatusBadge } from './status-badge';
import { TeamInviteDialog } from './team-invite-dialog';

import type {
  TeamMemberListItemDto as Member,
  CapabilityCatalogItemDto as Capability,
  PermissionPresetDto as PermissionPreset,
  MembershipInvitationDto as Invitation,
} from '@maevelle/contracts';

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
  const [presets, setPresets] = useState<readonly PermissionPreset[]>([]);
  const [invitations, setInvitations] = useState<readonly Invitation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedCapability, setSelectedCapability] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [teamResponse, capabilityResponse, presetResponse, invitationResponse] = await Promise.all([
        request<{ data: { items: readonly Member[] } }>('/admin/team?pageSize=100'),
        request<{ data: readonly Capability[] }>('/admin/team/capabilities'),
        request<{ data: readonly PermissionPreset[] }>('/admin/team/presets'),
        request<{ data: readonly Invitation[] }>('/admin/team/invitations'),
      ]);
      setMembers(teamResponse.data.items);
      setCapabilities(capabilityResponse.data);
      setPresets(presetResponse.data);
      setInvitations(invitationResponse.data);
      setSelectedId((current) => current || teamResponse.data.items[0]?.id || '');
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

  async function change(path: string, method: 'POST' | 'PUT', body: object, success: string) {
    setBusy(true);
    try {
      await request(path, { method, body: JSON.stringify(body) });
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
            <>
              <TeamInviteDialog
                capabilities={capabilities}
                presets={presets}
                onInvited={async (success) => {
                  await reload();
                  setMessage(success);
                  setTone('success');
                }}
              />
              <button className="button secondary" type="button" onClick={() => void reload()}>
                <RefreshCw aria-hidden="true" /> Refresh
              </button>
            </>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <Stats>
          <StatsCard>
            <StatsTitle>Members</StatsTitle>
            <StatsValue>{members.length}</StatsValue>
            <StatsDescription>current organization</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Active</StatsTitle>
            <StatsValue>{members.filter((member) => member.status === 'ACTIVE').length}</StatsValue>
            <StatsDescription>can authenticate</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>MFA enabled</StatsTitle>
            <StatsValue>{members.filter((member) => member.two_factor_enabled).length}</StatsValue>
            <StatsDescription>account security</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Owners</StatsTitle>
            <StatsValue>{members.filter((member) => member.membership_type === 'OWNER').length}</StatsValue>
            <StatsDescription>protected memberships</StatsDescription>
          </StatsCard>
        </Stats>
        {invitations.some((invitation) => invitation.status === 'PENDING') ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Pending access</p>
                <h2>Invitations</h2>
              </div>
            </div>
            <div className="data-table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Expires</th>
                    <th>Delivery</th>
                    <th>Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations
                    .filter((invitation) => invitation.status === 'PENDING')
                    .map((invitation) => (
                      <tr key={invitation.id}>
                        <td><strong>{invitation.display_name}</strong><small>{invitation.email}</small></td>
                        <td>{new Date(invitation.expires_at).toLocaleString()}</td>
                        <td>{invitation.last_sent_at ? 'Sent' : `Queued · ${invitation.delivery_attempt_count} attempts`}</td>
                        <td>{invitation.capability_codes.length} capabilities</td>
                        <td>
                          <div className="detail-actions">
                            <button
                              className="button secondary"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void change(
                                  `/admin/team/invitations/${invitation.id}/resend`,
                                  'POST',
                                  { expectedVersion: Number(invitation.version) },
                                  `Invitation resent to ${invitation.email}.`,
                                )
                              }
                            >Resend</button>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`Revoke the invitation for ${invitation.email}?`))
                                  void change(
                                    `/admin/team/invitations/${invitation.id}/revoke`,
                                    'POST',
                                    {
                                      expectedVersion: Number(invitation.version),
                                      reason: 'Revoked from Team and access',
                                    },
                                    `Invitation revoked for ${invitation.email}.`,
                                  );
                              }}
                            >Revoke</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
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
                                        `/admin/team/${selected.id}/permissions`,
                                        'PUT',
                                        {
                                          expectedVersion: Number(selected.version),
                                          capabilityCodes: selected.capabilities.filter(
                                            (capability) => capability !== code,
                                          ),
                                          scopes: selected.scopes.filter(
                                            (scope) => scope.capabilityCode !== code,
                                          ),
                                          reason: `Removed ${code} in Team and access`,
                                        },
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
                            `/admin/team/${selected.id}/permissions`,
                            'PUT',
                            {
                              expectedVersion: Number(selected.version),
                              capabilityCodes: [...selected.capabilities, selectedCapability],
                              scopes: selected.scopes,
                              reason: `Added ${selectedCapability} in Team and access`,
                            },
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
                              `/admin/team/${selected.id}/${
                                nextStatus === 'ACTIVE' ? 'restore' : 'suspend'
                              }`,
                              'POST',
                              {
                                expectedVersion: Number(selected.version),
                                reason:
                                  nextStatus === 'ACTIVE'
                                    ? 'Restored in Team and access'
                                    : 'Suspended in Team and access',
                              },
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
                      <button
                        className="button secondary"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Revoke all active sessions for ${selected.name}? They will be required to log in again.`,
                            )
                          ) {
                            void change(
                              `/admin/team/${selected.id}/sessions/revoke`,
                              'POST',
                              {},
                              `All sessions revoked for ${selected.name}.`,
                            );
                          }
                        }}
                      >
                        <KeyRound aria-hidden="true" /> Revoke sessions
                      </button>
                      <button
                        className="button secondary danger"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${selected.name} from the organization? Their permissions will be removed and sessions revoked.`,
                            )
                          ) {
                            void change(
                              `/admin/team/${selected.id}/remove`,
                              'POST',
                              {
                                expectedVersion: Number(selected.version),
                                reason: 'Removed by administrator in Team and access',
                              },
                              `${selected.name} was removed from the organization.`,
                            );
                          }
                        }}
                      >
                        <UserRoundX aria-hidden="true" /> Remove member
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
