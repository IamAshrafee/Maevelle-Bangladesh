'use client';

import { useEffect, useState } from 'react';
import type {
  ProductRecommendationActionDto,
  ProductRecommendationSettingsDto,
  RecommendationPlacementCodeDto,
  RecommendationPreviewDto,
} from '@maevelle/contracts';
import { ApiRequestError, fetchApiData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminCapability } from '@/components/admin-capabilities';

type Choice = { id: string; title: string; handle: string; publication_status: string };
const labels: Record<RecommendationPlacementCodeDto, string> = {
  pdp_complementary: 'Complete Your Look',
  pdp_similar: 'You May Also Like',
};

export function ProductRecommendations({ productId }: { productId?: string | undefined }) {
  const canCurate = useAdminCapability('recommendations.curate');
  const [settings, setSettings] = useState<ProductRecommendationSettingsDto[]>([]);
  const [selected, setSelected] = useState<RecommendationPlacementCodeDto>('pdp_complementary');
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<RecommendationPreviewDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const current = settings.find((item) => item.placement === selected);
  useEffect(() => {
    if (!productId) return;
    let live = true;
    fetchApiData<ProductRecommendationSettingsDto[]>(`/admin/recommendations/products/${productId}`)
      .then((data) => {
        if (live) setSettings(data);
      })
      .catch((caught) => {
        if (live)
          setError(caught instanceof Error ? caught.message : 'Unable to load recommendations.');
      });
    return () => {
      live = false;
    };
  }, [productId]);
  useEffect(() => {
    if (!productId) return;
    let live = true;
    const params = new URLSearchParams({ sourceProductId: productId, q: query, pageSize: '20' });
    fetchApiData<{ items: Choice[] }>(`/admin/recommendations/product-picker?${params}`)
      .then((data) => {
        if (live) {
          setChoices(data.items);
          setNames((previous) =>
            Object.fromEntries([
              ...Object.entries(previous),
              ...data.items.map((item) => [item.id, item.title] as const),
            ]),
          );
        }
      })
      .catch(() => {
        if (live) setChoices([]);
      });
    return () => {
      live = false;
    };
  }, [productId, query]);
  function patch(changes: Partial<ProductRecommendationSettingsDto>) {
    setSettings((previous) =>
      previous.map((item) => (item.placement === selected ? { ...item, ...changes } : item)),
    );
    setMessage('');
  }
  function addAction(targetProductId: string, action: ProductRecommendationActionDto['action']) {
    if (!current || !targetProductId) return;
    const others = current.actions.filter((item) => item.targetProductId !== targetProductId);
    const pinPosition =
      action === 'PIN'
        ? Math.max(
            0,
            ...others.filter((item) => item.action === 'PIN').map((item) => item.pinPosition ?? 0),
          ) + 1
        : null;
    patch({
      actions: [
        ...others,
        { targetProductId, action, pinPosition, boost: action === 'BOOST' ? 10 : null },
      ],
    });
  }
  async function save() {
    if (!productId || !current) return;
    setBusy(true);
    setError('');
    setConflict(false);
    setMessage('');
    try {
      const saved = await fetchApiData<ProductRecommendationSettingsDto>(
        `/admin/recommendations/products/${productId}`,
        { method: 'PATCH', body: JSON.stringify({ ...current, expectedVersion: current.version }) },
      );
      setSettings((previous) =>
        previous.map((item) => (item.placement === selected ? saved : item)),
      );
      setMessage('Recommendations saved.');
      try {
        const result = await fetchApiData<RecommendationPreviewDto>(
          '/admin/recommendations/preview',
          { method: 'POST', body: JSON.stringify({ productId, currency: 'BDT' }) },
        );
        setPreview(result);
      } catch {
        setMessage('Recommendations saved. Preview is temporarily unavailable.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save recommendations.');
      setConflict(caught instanceof ApiRequestError && caught.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function refreshPreview() {
    if (!productId) return;
    setBusy(true);
    setError('');
    try {
      setPreview(
        await fetchApiData<RecommendationPreviewDto>('/admin/recommendations/preview', {
          method: 'POST',
          body: JSON.stringify({
            productId,
            currency: 'BDT',
            proposed: current ? { ...current, expectedVersion: current.version } : undefined,
          }),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to preview recommendations.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Product recommendations</CardTitle>
        <p className="text-sm text-muted-foreground">
          Curate the two discovery sections shown on this Product’s storefront page.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {!productId ? (
          <p className="text-sm text-muted-foreground">
            Save the Product to configure its recommendations.
          </p>
        ) : !current ? (
          <p className="text-sm text-muted-foreground">Loading recommendation settings…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels) as RecommendationPlacementCodeDto[]).map((code) => (
                <Button
                  key={code}
                  type="button"
                  variant={selected === code ? 'default' : 'outline'}
                  onClick={() => {
                    setSelected(code);
                    setMessage('');
                  }}
                >
                  {labels[code]}
                </Button>
              ))}
            </div>
            <fieldset disabled={!canCurate} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-sm font-medium">
                  Mode
                  <NativeSelect
                    value={current.mode}
                    onChange={(event) =>
                      patch({
                        mode: event.target.value as ProductRecommendationSettingsDto['mode'],
                      })
                    }
                  >
                    <option value="AUTOMATIC">Automatic</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="MANUAL">Manual pins only</option>
                  </NativeSelect>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Status
                  <NativeSelect
                    value={current.enabled === null ? 'inherit' : String(current.enabled)}
                    onChange={(event) =>
                      patch({
                        enabled:
                          event.target.value === 'inherit' ? null : event.target.value === 'true',
                      })
                    }
                  >
                    <option value="inherit">Use placement default</option>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </NativeSelect>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Cards to show
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    placeholder="Placement default"
                    value={current.targetCount ?? ''}
                    onChange={(event) =>
                      patch({
                        targetCount: event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Minimum score
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Placement default"
                    value={current.minimumScore ?? ''}
                    onChange={(event) =>
                      patch({
                        minimumScore: event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Curated Products</h3>
                <p className="text-sm text-muted-foreground">
                  Pin a Product to place it first, boost its relevance, or exclude it. Only eligible
                  live Products appear to customers.
                </p>
                <Input
                  aria-label="Search Products to curate"
                  placeholder="Search Product name or handle"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                  {choices.map((choice) => (
                    <div
                      key={choice.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                    >
                      <span>
                        {choice.title}{' '}
                        <span className="text-muted-foreground">({choice.publication_status})</span>
                      </span>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addAction(choice.id, 'PIN')}
                        >
                          Pin
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addAction(choice.id, 'BOOST')}
                        >
                          Boost
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addAction(choice.id, 'EXCLUDE')}
                        >
                          Exclude
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {current.actions.map((item, index) => (
                  <div
                    key={item.targetProductId}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      {names[item.targetProductId] ?? item.targetProductId}
                    </span>
                    <NativeSelect
                      aria-label="Action"
                      className="w-28"
                      value={item.action}
                      onChange={(event) =>
                        addAction(
                          item.targetProductId,
                          event.target.value as ProductRecommendationActionDto['action'],
                        )
                      }
                    >
                      <option value="PIN">Pin</option>
                      <option value="BOOST">Boost</option>
                      <option value="EXCLUDE">Exclude</option>
                    </NativeSelect>
                    {item.action === 'PIN' && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={index === 0}
                          onClick={() => {
                            const actions = [...current.actions];
                            [actions[index - 1], actions[index]] = [
                              actions[index]!,
                              actions[index - 1]!,
                            ];
                            patch({
                              actions: actions.map((a, i) =>
                                a.action === 'PIN' ? { ...a, pinPosition: i + 1 } : a,
                              ),
                            });
                          }}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={index === current.actions.length - 1}
                          onClick={() => {
                            const actions = [...current.actions];
                            [actions[index + 1], actions[index]] = [
                              actions[index]!,
                              actions[index + 1]!,
                            ];
                            patch({
                              actions: actions.map((a, i) =>
                                a.action === 'PIN' ? { ...a, pinPosition: i + 1 } : a,
                              ),
                            });
                          }}
                        >
                          ↓
                        </Button>
                      </>
                    )}
                    {item.action === 'BOOST' && (
                      <Input
                        aria-label="Boost amount"
                        className="w-20"
                        type="number"
                        min={1}
                        max={30}
                        value={item.boost ?? 10}
                        onChange={(event) =>
                          patch({
                            actions: current.actions.map((a) =>
                              a.targetProductId === item.targetProductId
                                ? { ...a, boost: Number(event.target.value) }
                                : a,
                            ),
                          })
                        }
                      />
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        patch({
                          actions: current.actions.filter(
                            (a) => a.targetProductId !== item.targetProductId,
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={busy || !canCurate} onClick={() => void save()}>
                Save recommendations
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void refreshPreview()}
              >
                Preview pending changes
              </Button>
              <a className="text-sm text-primary underline" href="/recommendations">
                Global settings and coverage
              </a>
            </div>
            {message && (
              <p role="status" className="text-sm text-success">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {conflict && productId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void fetchApiData<ProductRecommendationSettingsDto[]>(
                    `/admin/recommendations/products/${productId}`,
                  )
                    .then((data) => {
                      setSettings(data);
                      setConflict(false);
                      setError('');
                    })
                    .catch((caught) =>
                      setError(
                        caught instanceof Error ? caught.message : 'Unable to reload settings.',
                      ),
                    );
                }}
              >
                Reload saved settings
              </Button>
            )}
            {preview && (
              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="font-semibold">Eligibility preview</h3>
                <p className="text-xs text-muted-foreground">
                  Draft Products can be previewed; sections appear to shoppers only after the source
                  Product is published.
                </p>
                {preview.sections
                  .filter((section) => section.placement === selected)
                  .map((section) => (
                    <div key={section.placement} className="space-y-2">
                      {section.items.length ? (
                        section.items.map((item) => (
                          <p key={item.productId} className="text-sm">
                            {item.position}. {item.title} · {item.price.amount}{' '}
                            {item.price.currency}{' '}
                            {item.reason && (
                              <span className="text-muted-foreground">· {item.reason}</span>
                            )}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No eligible recommendations. Check Product status, stock, price, media, or
                          relevance rules.
                        </p>
                      )}
                    </div>
                  ))}
                {preview.explanations
                  .filter((item) => item.placement === selected && item.outcome !== 'SELECTED')
                  .slice(0, 12)
                  .map((item) => (
                    <p key={item.productId} className="text-xs text-muted-foreground">
                      {names[item.productId] ?? item.productId}:{' '}
                      {item.outcome.toLowerCase().replace('_', ' ')} · {item.reasons.join(', ')}
                    </p>
                  ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
