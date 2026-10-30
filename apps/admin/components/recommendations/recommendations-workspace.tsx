'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  RecommendationPlacementSettingsDto,
  RecommendationPreviewDto,
} from '@maevelle/contracts';
import { fetchApiData } from '@/lib/api';
import { AdminPage, PageHeader, PagePanel } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useAdminCapability } from '@/components/admin-capabilities';

type Rule = {
  id: string;
  sourceProductTypeId: string;
  targetProductTypeId: string;
  sourceName: string;
  targetName: string;
  strength: number;
  enabled: boolean;
  version: number;
};
type Coverage = {
  items: {
    id: string;
    title: string;
    handle: string;
    actionCount: number;
    similarCount: number;
    complementaryCount: number;
  }[];
  page: number;
  pageSize: number;
  total: number;
};
type Performance = {
  measurement: string;
  placements: {
    placement: string;
    impressions: number;
    clicks: number;
    clickedImpressions: number;
    uniqueSessions: number;
    productPageContinuations: number;
    ctr: number | null;
  }[];
};
const names = { pdp_complementary: 'Complete Your Look', pdp_similar: 'You May Also Like' };
function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function RecommendationsWorkspace() {
  const canManage = useAdminCapability('recommendations.manage');
  const canCurate = useAdminCapability('recommendations.curate');
  const [placements, setPlacements] = useState<RecommendationPlacementSettingsDto[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rulePage, setRulePage] = useState(1);
  const [ruleQuery, setRuleQuery] = useState('');
  const [ruleTotal, setRuleTotal] = useState(0);
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [pendingPreview, setPendingPreview] = useState<RecommendationPreviewDto | null>(null);
  const [previewProductId, setPreviewProductId] = useState('');
  const [previewPlacement, setPreviewPlacement] =
    useState<RecommendationPlacementSettingsDto['code']>('pdp_similar');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPlacement, setBulkPlacement] =
    useState<RecommendationPlacementSettingsDto['code']>('pdp_similar');
  const [bulkEnablement, setBulkEnablement] = useState<'KEEP' | 'ENABLE' | 'DISABLE'>('KEEP');
  const [bulkAction, setBulkAction] = useState<'NONE' | 'PIN' | 'BOOST' | 'EXCLUDE' | 'REMOVE'>(
    'NONE',
  );
  const [bulkTargetQuery, setBulkTargetQuery] = useState('');
  const [bulkTargetId, setBulkTargetId] = useState('');
  const [bulkTargets, setBulkTargets] = useState<{ id: string; title: string }[]>([]);
  const [bulkBoost, setBulkBoost] = useState(10);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(() => dateOffset(-30));
  const [to, setTo] = useState(() => dateOffset(0));
  const [sourceType, setSourceType] = useState('');
  const [targetType, setTargetType] = useState('');
  const [strength, setStrength] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function loadSettings() {
    setPlacements(
      await fetchApiData<RecommendationPlacementSettingsDto[]>('/admin/recommendations/placements'),
    );
  }
  async function loadRules() {
    const params = new URLSearchParams({ q: ruleQuery, page: String(rulePage), pageSize: '20' });
    const result = await fetchApiData<{ items: Rule[]; total: number }>(
      `/admin/recommendations/compatibility-rules?${params}`,
    );
    setRules(result.items);
    setRuleTotal(result.total);
  }
  useEffect(() => {
    void loadSettings().catch((caught) =>
      setError(caught instanceof Error ? caught.message : 'Unable to load settings.'),
    );
    void fetchApiData<{ id: string; name: string }[]>('/admin/catalog/product-types')
      .then(setTypes)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void loadRules().catch((caught) =>
      setError(caught instanceof Error ? caught.message : 'Unable to load rules.'),
    );
  }, [ruleQuery, rulePage]);
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ q: query, page: String(page), pageSize: '10' });
    fetchApiData<Coverage>(`/admin/recommendations/coverage?${params}`)
      .then((data) => {
        if (live) setCoverage(data);
      })
      .catch((caught) => {
        if (live) setError(caught instanceof Error ? caught.message : 'Unable to load coverage.');
      });
    return () => {
      live = false;
    };
  }, [query, page]);
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ q: bulkTargetQuery, pageSize: '20' });
    void fetchApiData<{ items: { id: string; title: string }[] }>(
      `/admin/recommendations/product-picker?${params}`,
    )
      .then((result) => {
        if (live) setBulkTargets(result.items);
      })
      .catch(() => {
        if (live) setBulkTargets([]);
      });
    return () => {
      live = false;
    };
  }, [bulkTargetQuery]);
  useEffect(() => {
    let live = true;
    fetchApiData<Performance>(`/admin/recommendations/performance?from=${from}&to=${to}`)
      .then((data) => {
        if (live) setPerformance(data);
      })
      .catch(() => {
        if (live) setPerformance(null);
      });
    return () => {
      live = false;
    };
  }, [from, to]);
  function patch(
    code: RecommendationPlacementSettingsDto['code'],
    changes: Partial<RecommendationPlacementSettingsDto>,
  ) {
    setPlacements((previous) =>
      previous.map((item) => (item.code === code ? { ...item, ...changes } : item)),
    );
    setMessage('');
  }
  async function savePlacement(item: RecommendationPlacementSettingsDto) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await fetchApiData<RecommendationPlacementSettingsDto>(
        `/admin/recommendations/placements/${item.code}`,
        { method: 'PATCH', body: JSON.stringify({ ...item, expectedVersion: item.version }) },
      );
      patch(item.code, saved);
      setMessage(`${names[item.code]} settings saved.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save placement.');
    } finally {
      setBusy(false);
    }
  }
  async function saveRule() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const existing = rules.find(
        (rule) =>
          rule.sourceProductTypeId === sourceType && rule.targetProductTypeId === targetType,
      );
      await fetchApiData('/admin/recommendations/compatibility-rules', {
        method: 'PUT',
        body: JSON.stringify({
          sourceProductTypeId: sourceType,
          targetProductTypeId: targetType,
          strength,
          enabled: true,
          expectedVersion: existing?.version ?? 0,
        }),
      });
      await loadRules();
      setMessage('Compatibility rule saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save rule.');
    } finally {
      setBusy(false);
    }
  }
  async function toggleRule(rule: Rule) {
    setBusy(true);
    setError('');
    try {
      await fetchApiData('/admin/recommendations/compatibility-rules', {
        method: 'PUT',
        body: JSON.stringify({
          sourceProductTypeId: rule.sourceProductTypeId,
          targetProductTypeId: rule.targetProductTypeId,
          strength: rule.strength,
          enabled: !rule.enabled,
          expectedVersion: rule.version,
        }),
      });
      await loadRules();
      setMessage('Rule updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update rule.');
    } finally {
      setBusy(false);
    }
  }
  async function applyBulk(dryRun: boolean) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await fetchApiData<{
        outcomes: { productId: string; status: string; reason?: string }[];
      }>('/admin/recommendations/bulk', {
        method: 'POST',
        body: JSON.stringify({
          productIds: selected,
          placement: bulkPlacement,
          ...(bulkEnablement === 'KEEP' ? {} : { enabled: bulkEnablement === 'ENABLE' }),
          ...(bulkAction === 'NONE'
            ? {}
            : {
                action: bulkAction,
                targetProductId: bulkTargetId,
                ...(bulkAction === 'BOOST' ? { boost: bulkBoost } : {}),
              }),
          dryRun,
        }),
      });
      const failures = result.outcomes.filter((item) => item.status === 'FAILED');
      setMessage(
        `${result.outcomes.length - failures.length} Products ${dryRun ? 'ready' : 'processed'}.`,
      );
      if (failures.length)
        setError(failures.map((item) => `${item.productId}: ${item.reason}`).join(' · '));
      if (!dryRun) {
        setSelected([]);
        const params = new URLSearchParams({ q: query, page: String(page), pageSize: '10' });
        setCoverage(await fetchApiData<Coverage>(`/admin/recommendations/coverage?${params}`));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update Products.');
    } finally {
      setBusy(false);
    }
  }
  async function previewPlacementSettings() {
    const placementSettings = placements.find((item) => item.code === previewPlacement);
    if (!previewProductId || !placementSettings) return;
    setBusy(true);
    setError('');
    try {
      setPendingPreview(
        await fetchApiData<RecommendationPreviewDto>('/admin/recommendations/preview', {
          method: 'POST',
          body: JSON.stringify({ productId: previewProductId, currency: 'BDT', placementSettings }),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to preview placement.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Catalog discovery"
        title="Product recommendations"
        description="Manage PDP discovery, merchandising rules, coverage, and consented engagement."
        actions={
          <Button render={<Link href="/products" />} nativeButton={false} variant="outline">
            Open Products
          </Button>
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
      <PagePanel className="space-y-5">
        <h2 className="text-lg font-semibold">Placement defaults</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {placements.map((item) => (
            <div key={item.code} className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{names[item.code]}</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(event) => patch(item.code, { enabled: event.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['targetCount', 'Cards', 1, 12],
                    ['candidateLimit', 'Candidate pool', 12, 200],
                    ['minimumScore', 'Minimum score', 0, 100],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label key={key} className="space-y-1 text-xs font-medium">
                    {label}
                    <Input
                      type="number"
                      min={min}
                      max={max}
                      value={item[key]}
                      onChange={(event) => patch(item.code, { [key]: Number(event.target.value) })}
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Strategy: {item.strategy} · version {item.strategyVersion}
              </p>
              <Button disabled={busy || !canManage} onClick={() => void savePlacement(item)}>
                Save defaults
              </Button>
            </div>
          ))}
        </div>
      </PagePanel>
      <PagePanel className="space-y-4">
        <h2 className="text-lg font-semibold">Preview placement changes</h2>
        <p className="text-sm text-muted-foreground">
          Use a published Product from the coverage list below to inspect the current draft before
          saving it.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            Product
            <NativeSelect
              value={previewProductId}
              onChange={(event) => setPreviewProductId(event.target.value)}
            >
              <option value="">Select a Product</option>
              {coverage?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            Placement
            <NativeSelect
              value={previewPlacement}
              onChange={(event) =>
                setPreviewPlacement(
                  event.target.value as RecommendationPlacementSettingsDto['code'],
                )
              }
            >
              <option value="pdp_complementary">Complete Your Look</option>
              <option value="pdp_similar">You May Also Like</option>
            </NativeSelect>
          </label>
          <Button
            disabled={busy || !canManage || !previewProductId}
            onClick={() => void previewPlacementSettings()}
          >
            Preview draft
          </Button>
        </div>
        {pendingPreview?.sections
          .filter((section) => section.placement === previewPlacement)
          .map((section) => (
            <div key={section.placement} className="space-y-1 text-sm">
              {section.items.length ? (
                section.items.map((item) => (
                  <p key={item.productId}>
                    {item.position}. {item.title} · {item.price.amount} {item.price.currency}
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">No eligible Products for this placement.</p>
              )}
            </div>
          ))}
      </PagePanel>
      <PagePanel className="space-y-4">
        <h2 className="text-lg font-semibold">Complementary Product Types</h2>
        <p className="text-sm text-muted-foreground">
          Map Product Types that style well together. Strength affects ranking; live eligibility
          still applies.
        </p>
        <Input
          aria-label="Search compatibility rules"
          placeholder="Search Product Types"
          value={ruleQuery}
          onChange={(event) => {
            setRuleQuery(event.target.value);
            setRulePage(1);
          }}
        />
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>
                {rule.sourceName} → {rule.targetName} · strength {rule.strength}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !canManage}
                onClick={() => void toggleRule(rule)}
              >
                {rule.enabled ? 'Disable' : 'Enable'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canManage}
                onClick={() => {
                  setSourceType(rule.sourceProductTypeId);
                  setTargetType(rule.targetProductTypeId);
                  setStrength(rule.strength);
                }}
              >
                Edit strength
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Button
            variant="outline"
            disabled={rulePage <= 1}
            onClick={() => setRulePage(rulePage - 1)}
          >
            Previous
          </Button>
          <span className="font-mono tabular-nums">
            Page {rulePage} · {ruleTotal} rules
          </span>
          <Button
            variant="outline"
            disabled={rulePage * 20 >= ruleTotal}
            onClick={() => setRulePage(rulePage + 1)}
          >
            Next
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            Source Product Type
            <NativeSelect
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
            >
              <option value="">Select a type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            Target Product Type
            <NativeSelect
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
            >
              <option value="">Select a type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            Strength
            <Input
              type="number"
              min={1}
              max={100}
              value={strength}
              onChange={(event) => setStrength(Number(event.target.value))}
            />
          </label>
        </div>
        <Button
          disabled={busy || !canManage || !sourceType || !targetType}
          onClick={() => void saveRule()}
        >
          Save rule
        </Button>
      </PagePanel>
      <PagePanel className="space-y-4">
        <h2 className="text-lg font-semibold">Product coverage</h2>
        <Input
          aria-label="Search published Products"
          placeholder="Search published Products"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
            setSelected([]);
          }}
        />
        <div className="space-y-2">
          {coverage?.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${item.title}`}
                  checked={selected.includes(item.id)}
                  onChange={(event) =>
                    setSelected((previous) =>
                      event.target.checked
                        ? [...previous, item.id]
                        : previous.filter((id) => id !== item.id),
                    )
                  }
                />
                <Link
                  className="font-medium text-primary underline"
                  href={`/products/${item.id}/edit?section=recommendations`}
                >
                  {item.title}
                </Link>
              </label>
              <span className="font-mono tabular-nums text-muted-foreground">
                Similar {item.similarCount} · Complementary {item.complementaryCount} · Curated{' '}
                {item.actionCount}
              </span>
            </div>
          ))}
          {coverage && coverage.total === 0 && (
            <p className="text-sm text-muted-foreground">No published Products match.</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => {
              setPage(page - 1);
              setSelected([]);
            }}
          >
            Previous
          </Button>
          <span className="text-sm tabular-nums">
            Page {page} · {coverage?.total ?? 0} Products
          </span>
          <Button
            variant="outline"
            disabled={!coverage || page * coverage.pageSize >= coverage.total}
            onClick={() => {
              setPage(page + 1);
              setSelected([]);
            }}
          >
            Next
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <span className="text-sm">{selected.length} selected</span>
          <label className="space-y-1 text-sm">
            Placement
            <NativeSelect
              value={bulkPlacement}
              onChange={(event) =>
                setBulkPlacement(event.target.value as RecommendationPlacementSettingsDto['code'])
              }
            >
              <option value="pdp_similar">You May Also Like</option>
              <option value="pdp_complementary">Complete Your Look</option>
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            Placement status
            <NativeSelect
              value={bulkEnablement}
              onChange={(event) =>
                setBulkEnablement(event.target.value as 'KEEP' | 'ENABLE' | 'DISABLE')
              }
            >
              <option value="KEEP">Keep current</option>
              <option value="ENABLE">Enable</option>
              <option value="DISABLE">Disable</option>
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm">
            Target action
            <NativeSelect
              value={bulkAction}
              onChange={(event) => setBulkAction(event.target.value as typeof bulkAction)}
            >
              <option value="NONE">No target change</option>
              <option value="PIN">Pin</option>
              <option value="BOOST">Boost</option>
              <option value="EXCLUDE">Exclude</option>
              <option value="REMOVE">Remove rule</option>
            </NativeSelect>
          </label>
          {bulkAction !== 'NONE' && (
            <div className="space-y-2">
              <Input
                aria-label="Search target Products"
                placeholder="Search target Products"
                value={bulkTargetQuery}
                onChange={(event) => setBulkTargetQuery(event.target.value)}
              />
              <NativeSelect
                aria-label="Target Product"
                value={bulkTargetId}
                onChange={(event) => setBulkTargetId(event.target.value)}
              >
                <option value="">Select target</option>
                {bulkTargets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {bulkAction === 'BOOST' && (
            <label className="space-y-1 text-sm">
              Boost
              <Input
                type="number"
                min={1}
                max={30}
                value={bulkBoost}
                onChange={(event) => setBulkBoost(Number(event.target.value))}
              />
            </label>
          )}
          <Button
            variant="outline"
            disabled={
              busy ||
              !canCurate ||
              selected.length === 0 ||
              (bulkEnablement === 'KEEP' && bulkAction === 'NONE') ||
              (bulkAction !== 'NONE' && !bulkTargetId)
            }
            onClick={() => void applyBulk(true)}
          >
            Review selection
          </Button>
          <Button
            disabled={
              busy ||
              !canCurate ||
              selected.length === 0 ||
              (bulkEnablement === 'KEEP' && bulkAction === 'NONE') ||
              (bulkAction !== 'NONE' && !bulkTargetId)
            }
            onClick={() => void applyBulk(false)}
          >
            Apply to selected
          </Button>
        </div>
      </PagePanel>
      <PagePanel className="space-y-4">
        <h2 className="text-lg font-semibold">Consented engagement</h2>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1 text-sm">
            From
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            To
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Browser events from visitors who opted into analytics. Consent coverage cannot be
          calculated because denied and unknown sessions are untracked. Product page visits are
          observed within 30 minutes of a click. Click rate is distinct viewed lists with a click
          divided by viewed lists; no purchase attribution is included.
        </p>
        {performance ? (
          performance.placements.map((item) => (
            <div key={item.placement} className="rounded-md border border-border p-3 text-sm">
              <strong>{names[item.placement as keyof typeof names]}</strong>
              <p className="font-mono tabular-nums text-muted-foreground">
                {item.impressions} views · {item.clicks} clicks · {item.productPageContinuations}{' '}
                Product page visits · {item.uniqueSessions} sessions ·{' '}
                {item.ctr === null ? '—' : `${(item.ctr * 100).toFixed(1)}%`} click rate
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Performance data is unavailable or you do not have analytics access.
          </p>
        )}
      </PagePanel>
    </AdminPage>
  );
}
