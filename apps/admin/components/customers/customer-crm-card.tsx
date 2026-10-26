'use client';

import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, RefreshCw, UserRoundCheck } from 'lucide-react';
import type {
  CustomerCrmProfileDto,
  CustomerIdentityLinkDto,
  CustomerLifecycleStageDto,
} from '@maevelle/contracts';
import { fetchApiData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { StatusBadge } from '@/components/status-badge';
import { ErrorState, LoadingState } from '@/components/ui/page-shell';
import { IdentityRevokeDialog } from './identity-revoke-dialog';
import { useAdminCapability } from '@/components/admin-capabilities';
import { CreatePrivacyRequestDialog } from './create-privacy-request-dialog';
import { CustomerCrmProfileDialog } from './customer-crm-profile-dialog';
import { CustomerPreferenceDialog } from './customer-preference-dialog';
import { CustomerFollowUpDialog } from './customer-follow-up-dialog';
import { CustomerCustomFieldsDialog } from './customer-custom-fields-dialog';

export function CustomerCrmCard({
  customerId,
  customerVersion,
  isReadOnly,
  onUpdated,
}: {
  customerId: string;
  customerVersion: number;
  isReadOnly: boolean;
  onUpdated: () => void;
}) {
  const [profile, setProfile] = useState<CustomerCrmProfileDto>();
  const [identities, setIdentities] = useState<readonly CustomerIdentityLinkDto[]>([]);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<CustomerLifecycleStageDto>('PROSPECT');
  const [saving, setSaving] = useState(false);
  const canManageIdentity = useAdminCapability('customers.identity.manage');
  const canManagePrivacy = useAdminCapability('customers.privacy.manage');
  const canManageCustomer = useAdminCapability('customers.manage');
  const canManageRelationship = useAdminCapability('customers.relationship.manage');
  const load = useCallback(async () => {
    setError('');
    try {
      const [p, i] = await Promise.all([
        fetchApiData<CustomerCrmProfileDto>(`/admin/customers/${customerId}/crm`),
        fetchApiData<{ items: readonly CustomerIdentityLinkDto[] }>(
          `/admin/customers/${customerId}/identities`,
        ),
      ]);
      setProfile(p);
      setStage(p.lifecycleStage);
      setIdentities(i.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'CRM profile could not be loaded.');
    }
  }, [customerId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function transition() {
    if (!profile || stage === profile.lifecycleStage) return;
    setSaving(true);
    setError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/lifecycle-transitions`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: customerVersion,
          stage,
          reason: 'Authorized lifecycle update from Customer 360 profile',
        }),
      });
      await load();
      onUpdated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Lifecycle could not be changed.');
    } finally {
      setSaving(false);
    }
  }
  async function claimRelationship() {
    if (!profile) return;
    setSaving(true);
    setError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/relationship`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: customerVersion,
          relationshipStatus: 'ACTIVE',
          reason: 'Relationship claimed from Customer 360 profile',
        }),
      });
      await load();
      onUpdated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Relationship could not be assigned.');
    } finally {
      setSaving(false);
    }
  }
  async function completeFollowUp(followUpId: string, expectedVersion: number) {
    setSaving(true);
    setError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/follow-ups/${followUpId}/completion`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Follow-up could not be completed.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="rounded-xl border border-border bg-card shadow-2xs"
      aria-label="Customer relationship profile"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <UserRoundCheck className="size-4 text-primary" />
          <h2 className="font-semibold">CRM relationship</h2>
        </div>
        <div className="flex items-center gap-2">
          {profile && canManageCustomer && !isReadOnly ? (
            <CustomerCrmProfileDialog
              customerId={customerId}
              customerVersion={customerVersion}
              profile={profile}
              onUpdated={() => {
                void load();
                onUpdated();
              }}
            />
          ) : null}
          {canManagePrivacy ? <CreatePrivacyRequestDialog customerId={customerId} /> : null}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void load()}
            aria-label="Refresh CRM profile"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-5 p-5">
        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : !profile ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Profile completeness</p>
                <p className="font-mono text-xl font-semibold tabular-nums">
                  {profile.completeness.percentage}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Relationship owner</p>
                <p className="text-sm font-medium">
                  {profile.relationshipOwnerName ?? 'Unassigned'}
                </p>
                {canManageRelationship && !profile.relationshipOwnerMembershipId ? (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void claimRelationship()}
                  >
                    Assign to me
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Structured name</p>
                <p>
                  {[profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
                    'Not recorded'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Preferred language</p>
                <p className="font-mono">{profile.preferredLanguage ?? 'Not recorded'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Relationship status</p>
                <StatusBadge status={profile.relationshipStatus} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last activity</p>
                <p className="font-mono tabular-nums">
                  {profile.lastActivityAt
                    ? new Date(profile.lastActivityAt).toLocaleString('en-BD')
                    : 'No activity'}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium">Lifecycle</p>
              <div className="flex gap-2">
                <NativeSelect
                  disabled={isReadOnly}
                  value={stage}
                  onChange={(event) => setStage(event.target.value as CustomerLifecycleStageDto)}
                >
                  {[
                    'NEW_CONTACT',
                    'PROSPECT',
                    'ENGAGED_PROSPECT',
                    'FIRST_TIME_BUYER',
                    'REPEAT_CUSTOMER',
                    'LOYAL_CUSTOMER',
                    'INACTIVE_CUSTOMER',
                    'RE_ENGAGED_CUSTOMER',
                  ].map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {value.replaceAll('_', ' ')}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  size="sm"
                  disabled={saving || isReadOnly || stage === profile.lifecycleStage}
                  onClick={() => void transition()}
                >
                  {saving ? 'Saving…' : 'Apply'}
                </Button>
              </div>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">Preferences</p>
                {canManageCustomer && !isReadOnly ? (
                  <CustomerPreferenceDialog customerId={customerId} onUpdated={() => void load()} />
                ) : null}
              </div>
              {profile.preferences.length ? (
                <div className="space-y-2">
                  {profile.preferences.map((preference) => (
                    <div
                      key={preference.id}
                      className="rounded-lg border border-border p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{preference.key.replaceAll('_', ' ')}</span>
                        <StatusBadge
                          status={preference.confidence}
                          tone={
                            preference.confidence === 'CONFIRMED'
                              ? 'success'
                              : preference.confidence === 'REPORTED'
                                ? 'info'
                                : 'warning'
                          }
                        />
                      </div>
                      <p className="mt-1 break-words text-muted-foreground">
                        {typeof preference.value === 'string'
                          ? preference.value
                          : JSON.stringify(preference.value)}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {preference.source.replaceAll('_', ' ')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No preferences recorded.</p>
              )}
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">Follow-ups</p>
                {canManageRelationship ? (
                  <CustomerFollowUpDialog customerId={customerId} onUpdated={() => void load()} />
                ) : null}
              </div>
              {profile.followUps.length ? (
                <div className="space-y-2">
                  {profile.followUps.map((followUp) => (
                    <div
                      key={followUp.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border p-2 text-xs"
                    >
                      <div>
                        <p className="font-medium">{followUp.title}</p>
                        <p className="font-mono tabular-nums text-muted-foreground">
                          {new Date(followUp.dueAt).toLocaleString('en-BD')} ·{' '}
                          {followUp.assigneeName ?? 'Assigned team member'}
                        </p>
                        {followUp.details ? (
                          <p className="mt-1 text-muted-foreground">{followUp.details}</p>
                        ) : null}
                      </div>
                      {followUp.status === 'OPEN' && canManageRelationship ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => void completeFollowUp(followUp.id, followUp.version)}
                        >
                          Complete
                        </Button>
                      ) : (
                        <StatusBadge status={followUp.status} />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No follow-ups.</p>
              )}
            </div>
            {profile.customFields.length ? (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium">Custom fields</p>
                  {canManageCustomer && !isReadOnly ? (
                    <CustomerCustomFieldsDialog
                      customerId={customerId}
                      fields={profile.customFields}
                      onUpdated={() => void load()}
                    />
                  ) : null}
                </div>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {profile.customFields.map((field) => (
                    <div
                      key={field.definition.id}
                      className="rounded-lg border border-border p-2 text-xs"
                    >
                      <dt className="text-muted-foreground">{field.definition.label}</dt>
                      <dd className="mt-1 break-words font-medium">
                        {field.value == null
                          ? 'Not recorded'
                          : typeof field.value === 'string'
                            ? field.value
                            : JSON.stringify(field.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {profile.consents.length ? (
              <div>
                <p className="mb-2 text-xs font-medium">Consent and communication basis</p>
                <div className="space-y-2">
                  {profile.consents.map((consent) => (
                    <div
                      key={consent.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs"
                    >
                      <div>
                        <p className="font-medium">{consent.purpose}</p>
                        <p className="text-muted-foreground">
                          {consent.channel} · {consent.source}
                        </p>
                      </div>
                      <StatusBadge
                        status={consent.status}
                        tone={consent.status === 'GRANTED' ? 'success' : 'warning'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Fingerprint className="size-4 text-primary" />
                <p className="text-xs font-medium">Linked identities</p>
              </div>
              {identities.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No verified channel identity is linked. Use the inbox identity workflow when
                  evidence is available.
                </p>
              ) : (
                <div className="space-y-2">
                  {identities.map((identity) => (
                    <div
                      key={identity.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {identity.displayName ?? identity.username ?? identity.provider}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {identity.provider} · {identity.status} ·{' '}
                          {identity.evidenceMethod.replaceAll('_', ' ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          status={identity.assurance}
                          tone={
                            identity.assurance === 'HIGH'
                              ? 'success'
                              : identity.assurance === 'MEDIUM'
                                ? 'info'
                                : 'warning'
                          }
                        />
                        {identity.status === 'LINKED' && canManageIdentity ? (
                          <IdentityRevokeDialog identity={identity} onRevoked={() => void load()} />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {profile.completeness.missing.length || profile.completeness.unverified.length ? (
              <p className="text-xs text-muted-foreground">
                Missing:{' '}
                {[
                  ...profile.completeness.missing,
                  ...profile.completeness.unverified.map((item) => `${item} verification`),
                ].join(', ')}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
