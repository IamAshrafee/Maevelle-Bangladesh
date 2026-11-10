'use client';

import * as React from 'react';
import { HelpCircle, Save, Sparkles } from 'lucide-react';
import type { RecommendationPlacementSettingsDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PLACEMENT_LABELS,
  PLACEMENT_DESCRIPTIONS,
  type PlacementCode,
} from '../recommendations-types';

interface PlacementsTabProps {
  placements: RecommendationPlacementSettingsDto[];
  onSavePlacement: (item: RecommendationPlacementSettingsDto) => Promise<void>;
  canManage: boolean;
  busy: boolean;
}

export function PlacementsTab({
  placements,
  onSavePlacement,
  canManage,
  busy,
}: PlacementsTabProps) {
  // Local state copy to allow safe editing before committing
  const [drafts, setDrafts] = React.useState<Record<string, RecommendationPlacementSettingsDto>>(
    {},
  );
  const [savingCode, setSavingCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    const map: Record<string, RecommendationPlacementSettingsDto> = {};
    for (const p of placements) {
      map[p.code] = { ...p };
    }
    setDrafts(map);
  }, [placements]);

  function updateDraft(
    code: PlacementCode,
    changes: Partial<RecommendationPlacementSettingsDto>,
  ) {
    setDrafts((prev) => {
      const current = prev[code] ?? placements.find((p) => p.code === code);
      if (!current) return prev;
      return { ...prev, [code]: { ...current, ...changes } };
    });
  }

  async function handleSave(code: PlacementCode) {
    const draft = drafts[code];
    if (!draft) return;
    setSavingCode(code);
    try {
      await onSavePlacement(draft);
    } finally {
      setSavingCode(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border/70 pb-3">
        <h2 className="text-base font-semibold text-foreground">Global Discovery Placements</h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Configure the default presentation rules and candidate retrieval limits for storefront
          recommendation carousels. Individual products can override card counts or pin specific
          items.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {placements.map((item) => {
          const draft = drafts[item.code] ?? item;
          const isSaving = savingCode === item.code;
          const isDirty =
            draft.enabled !== item.enabled ||
            draft.targetCount !== item.targetCount ||
            draft.candidateLimit !== item.candidateLimit ||
            draft.minimumScore !== item.minimumScore;

          return (
            <div
              key={item.code}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-2xs space-y-5"
            >
              {/* Header */}
              <div className="space-y-2 border-b border-border/60 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="size-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-sm sm:text-base">
                        {PLACEMENT_LABELS[item.code]}
                      </h3>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {item.code}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={draft.enabled ? 'ACTIVE' : 'DISABLED'}
                      className="text-[11px] px-2 py-0.5"
                    />
                    <Switch
                      checked={draft.enabled}
                      disabled={!canManage || busy}
                      onCheckedChange={(val) => updateDraft(item.code, { enabled: val })}
                      aria-label={`Toggle ${PLACEMENT_LABELS[item.code]}`}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {PLACEMENT_DESCRIPTIONS[item.code]}
                </p>
              </div>

              {/* Parameter Settings Grid */}
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Target Count */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Cards to Show</label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="size-3.5 text-muted-foreground cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Number of cards presented to customers in this carousel (1–12).
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={draft.targetCount}
                    disabled={!canManage || busy}
                    onChange={(e) =>
                      updateDraft(item.code, { targetCount: Number(e.target.value) })
                    }
                    className="font-mono tabular-nums h-9 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">Range: 1–12 cards</span>
                </div>

                {/* Candidate Pool */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Candidate Pool</label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="size-3.5 text-muted-foreground cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Number of highest-ranking candidate products retrieved before
                          deduplication and stock filtering (12–200).
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    type="number"
                    min={12}
                    max={200}
                    value={draft.candidateLimit}
                    disabled={!canManage || busy}
                    onChange={(e) =>
                      updateDraft(item.code, { candidateLimit: Number(e.target.value) })
                    }
                    className="font-mono tabular-nums h-9 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">Range: 12–200 items</span>
                </div>

                {/* Minimum Score */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Min Relevance</label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="size-3.5 text-muted-foreground cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Products with an algorithm match score below this threshold are omitted
                          (0–100%).
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.minimumScore}
                    disabled={!canManage || busy}
                    onChange={(e) =>
                      updateDraft(item.code, { minimumScore: Number(e.target.value) })
                    }
                    className="font-mono tabular-nums h-9 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">Range: 0–100% cutoff</span>
                </div>
              </div>

              {/* Footer info & Save Button */}
              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                <span className="text-[11px] font-mono text-muted-foreground">
                  Strategy: {item.strategy} · v{item.strategyVersion}
                </span>

                <div className="flex items-center gap-2">
                  {isDirty && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.code]: { ...item },
                        }))
                      }
                    >
                      Reset
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canManage || busy || !isDirty}
                    onClick={() => void handleSave(item.code)}
                    className="h-8 text-xs gap-1.5 shadow-sm"
                  >
                    <Save className="size-3.5" />
                    {isSaving ? 'Saving…' : 'Save Defaults'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
