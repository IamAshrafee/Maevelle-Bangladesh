'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import type { CustomerCustomFieldDefinitionDto } from '@maevelle/contracts';
import { fetchApiData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { StatusBadge } from '@/components/status-badge';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import { CrmNav } from './crm-nav';
import { useAdminCapability } from '@/components/admin-capabilities';

export function CrmSettingsConsole() {
  const [fields, setFields] = useState<readonly CustomerCustomFieldDefinitionDto[]>();
  const [error, setError] = useState('');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomerCustomFieldDefinitionDto['valueType']>('TEXT');
  const [choices, setChoices] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [isSearchable, setIsSearchable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliation, setReconciliation] = useState<{
    created: number;
    alreadyReconciled: number;
    withoutIdentity: number;
  } | null>(null);
  const canManageIdentity = useAdminCapability('customers.identity.manage');
  const load = useCallback(async () => {
    setError('');
    try {
      setFields(await fetchApiData('/admin/crm/custom-fields'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'CRM settings could not be loaded.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    setSaving(true);
    setError('');
    try {
      await fetchApiData('/admin/crm/custom-fields', {
        method: 'POST',
        body: JSON.stringify({
          key,
          label,
          valueType: type,
          ...(['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(type)
            ? {
                choices: choices
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              }
            : {}),
          isRequired,
          isSearchable,
        }),
      });
      setKey('');
      setLabel('');
      setChoices('');
      setIsRequired(false);
      setIsSearchable(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Custom field could not be created.');
    } finally {
      setSaving(false);
    }
  }
  async function reconcile() {
    setReconciling(true);
    setError('');
    try {
      setReconciliation(
        await fetchApiData('/admin/crm/identity-links/reconciliation', { method: 'POST' }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Historical identity reconciliation failed.',
      );
    } finally {
      setReconciling(false);
    }
  }
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Customer 360"
        title="CRM settings"
        description="Govern lifecycle thresholds, typed profile attributes, and protected CRM behavior."
      />
      <CrmNav />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {canManageIdentity ? (
        <PageSection
          title="Historical identity reconciliation"
          description="Idempotently imports legacy Messaging contact-to-customer projections as explicitly low-assurance links. It never upgrades assurance or overwrites an existing active link."
        >
          <PagePanel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {reconciliation ? (
                <p className="text-sm">
                  <span className="font-mono tabular-nums">{reconciliation.created}</span> created ·{' '}
                  <span className="font-mono tabular-nums">{reconciliation.alreadyReconciled}</span>{' '}
                  already reconciled ·{' '}
                  <span className="font-mono tabular-nums">{reconciliation.withoutIdentity}</span>{' '}
                  without a provider identity
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run after importing a database that predates the CRM identity-link authority.
                </p>
              )}
            </div>
            <Button variant="outline" disabled={reconciling} onClick={() => void reconcile()}>
              {reconciling ? 'Reconciling…' : 'Run reconciliation'}
            </Button>
          </PagePanel>
        </PageSection>
      ) : null}
      <PageSection
        title="Custom profile attributes"
        description="Each field has a type, schema version, validation contract, and edit capability."
      >
        <PagePanel>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_12rem_auto] xl:items-end">
            <div>
              <Label htmlFor="field-key">Field key</Label>
              <Input
                id="field-key"
                value={key}
                onChange={(event) =>
                  setKey(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                }
                placeholder="preferred_fabric"
              />
            </div>
            <div>
              <Label htmlFor="field-label">Label</Label>
              <Input
                id="field-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Preferred fabric"
              />
            </div>
            <div>
              <Label htmlFor="field-type">Type</Label>
              <NativeSelect
                id="field-type"
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
              >
                {['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SINGLE_CHOICE', 'MULTI_CHOICE'].map(
                  (value) => (
                    <NativeSelectOption key={value} value={value}>
                      {value.replaceAll('_', ' ')}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            </div>
            <Button
              disabled={
                saving ||
                key.length < 2 ||
                !label.trim() ||
                (['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(type) &&
                  !choices.split(',').some((item) => item.trim()))
              }
              onClick={() => void create()}
            >
              <Plus className="size-4" />
              {saving ? 'Creating…' : 'Create'}
            </Button>
            {['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(type) ? (
              <div className="space-y-1 md:col-span-2 xl:col-span-4">
                <Label htmlFor="field-choices">Allowed choices</Label>
                <Input
                  id="field-choices"
                  value={choices}
                  onChange={(event) => setChoices(event.target.value)}
                  placeholder="Classic, Modern, Minimal"
                />
                <p className="text-xs text-muted-foreground">Separate choices with commas.</p>
              </div>
            ) : null}
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={isRequired}
                onChange={(event) => setIsRequired(event.target.checked)}
              />{' '}
              Required on complete profiles
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={isSearchable}
                onChange={(event) => setIsSearchable(event.target.checked)}
              />{' '}
              Searchable
            </label>
          </div>
        </PagePanel>
      </PageSection>
      {!fields ? (
        <LoadingState />
      ) : fields.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No custom attributes"
          description="The standard customer profile remains available without organization-defined fields."
        />
      ) : (
        <PagePanel className="divide-y divide-border p-0">
          {fields.map((field) => (
            <div
              key={field.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{field.label}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {field.key} · schema v{field.schemaVersion}
                </p>
              </div>
              <div className="flex gap-2">
                <StatusBadge status={field.valueType} tone="info" />
                <StatusBadge status={field.status} />
              </div>
            </div>
          ))}
        </PagePanel>
      )}
    </AdminPage>
  );
}
