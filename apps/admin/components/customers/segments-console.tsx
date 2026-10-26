'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import type { CustomerSegmentDto } from '@maevelle/contracts';
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

export function SegmentsConsole() {
  const [segments, setSegments] = useState<readonly CustomerSegmentDto[]>();
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'STATIC' | 'DYNAMIC'>('STATIC');
  const [stage, setStage] = useState('REPEAT_CUSTOMER');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      setSegments(await fetchApiData('/admin/crm/segments'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Segments could not be loaded.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await fetchApiData('/admin/crm/segments', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          segmentType: type,
          ...(type === 'DYNAMIC'
            ? {
                ruleDefinition: {
                  all: [{ field: 'lifecycleStage', operator: 'EQ', value: stage }],
                },
              }
            : {}),
        }),
      });
      setName('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Segment could not be created.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Customer 360"
        title="Customer segments"
        description="Build reusable static groups and validated rule-based audiences. Segment membership never grants messaging consent."
      />
      <CrmNav />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      <PageSection
        title="Create segment"
        description="Dynamic rules are compiled to bounded parameterized PostgreSQL queries; arbitrary SQL is never accepted."
      >
        <PagePanel>
          <div className="grid gap-4 md:grid-cols-[1fr_12rem_1fr_auto] md:items-end">
            <div>
              <Label htmlFor="segment-name">Name</Label>
              <Input
                id="segment-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="VIP customers"
              />
            </div>
            <div>
              <Label htmlFor="segment-type">Type</Label>
              <NativeSelect
                id="segment-type"
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
              >
                <NativeSelectOption value="STATIC">Static</NativeSelectOption>
                <NativeSelectOption value="DYNAMIC">Dynamic</NativeSelectOption>
              </NativeSelect>
            </div>
            {type === 'DYNAMIC' ? (
              <div>
                <Label htmlFor="segment-stage">Lifecycle rule</Label>
                <NativeSelect
                  id="segment-stage"
                  value={stage}
                  onChange={(event) => setStage(event.target.value)}
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
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Members are added explicitly from the member view or customer bulk actions.
              </div>
            )}
            <Button disabled={saving || !name.trim()} onClick={() => void create()}>
              <Plus className="size-4" />
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </PagePanel>
      </PageSection>
      {!segments ? (
        <LoadingState />
      ) : segments.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No customer segments"
          description="Create a static group or an explainable dynamic segment."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {segments.map((segment) => (
            <PagePanel key={segment.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{segment.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {segment.description ??
                      (segment.segmentType === 'STATIC'
                        ? 'Operator-managed membership'
                        : 'Rule-evaluated membership')}
                  </p>
                </div>
                <StatusBadge status={segment.segmentType} tone="info" />
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="font-mono text-2xl font-semibold tabular-nums">
                    {segment.memberCount}
                  </p>
                  <p className="text-xs text-muted-foreground">projected members</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`/customers/segments/${segment.id}`} />}
                  nativeButton={false}
                >
                  View members
                </Button>
              </div>
            </PagePanel>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
