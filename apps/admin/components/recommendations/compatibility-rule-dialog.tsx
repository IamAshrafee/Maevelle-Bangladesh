'use client';

import * as React from 'react';
import { ArrowRight, HelpCircle, Sparkles } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProductTypeItem, RuleItem } from './recommendations-types';

interface CompatibilityRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: ProductTypeItem[];
  editingRule: RuleItem | null;
  onSave: (input: {
    sourceProductTypeId: string;
    targetProductTypeId: string;
    strength: number;
    enabled: boolean;
    expectedVersion: number;
  }) => Promise<void>;
}

export function CompatibilityRuleDialog({
  open,
  onOpenChange,
  types,
  editingRule,
  onSave,
}: CompatibilityRuleDialogProps) {
  const [sourceType, setSourceType] = React.useState('');
  const [targetType, setTargetType] = React.useState('');
  const [strength, setStrength] = React.useState(50);
  const [enabled, setEnabled] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (editingRule) {
      setSourceType(editingRule.sourceProductTypeId);
      setTargetType(editingRule.targetProductTypeId);
      setStrength(editingRule.strength);
      setEnabled(editingRule.enabled);
    } else {
      setSourceType('');
      setTargetType('');
      setStrength(50);
      setEnabled(true);
    }
    setError('');
  }, [editingRule, open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!sourceType || !targetType) {
      setError('Please select both a source and target product type.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({
        sourceProductTypeId: sourceType,
        targetProductTypeId: targetType,
        strength,
        enabled,
        expectedVersion: editingRule?.version ?? 0,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save compatibility rule.');
    } finally {
      setBusy(false);
    }
  }

  const getStrengthLabel = (val: number) => {
    if (val >= 80) return 'Very Strong Affinity';
    if (val >= 60) return 'High Priority Pairing';
    if (val >= 40) return 'Balanced Relevance';
    if (val >= 20) return 'Subtle Suggestion';
    return 'Low Priority';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {editingRule ? 'Edit Compatibility Rule' : 'New Compatibility Rule'}
          </SheetTitle>
          <SheetDescription>
            Pair product types that style together for the &ldquo;Complete Your Look&rdquo;
            storefront carousel.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            <div className="space-y-4 py-1">
              {/* Source & Target Types Selection */}
              <div className="space-y-3">
                <label className="block space-y-1 text-xs font-semibold text-foreground">
                  <span>Source Product Type (Customer is viewing)</span>
                  <NativeSelect
                    value={sourceType}
                    disabled={Boolean(editingRule) || busy}
                    onChange={(e) => setSourceType(e.target.value)}
                    className="w-full"
                    required
                  >
                    <option value="">Select source product type</option>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>

                <div className="flex justify-center text-muted-foreground py-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full border border-border/60">
                    <span>Styles with</span>
                    <ArrowRight className="size-3 text-primary" />
                  </div>
                </div>

                <label className="block space-y-1 text-xs font-semibold text-foreground">
                  <span>Target Product Type (Recommended companion)</span>
                  <NativeSelect
                    value={targetType}
                    disabled={Boolean(editingRule) || busy}
                    onChange={(e) => setTargetType(e.target.value)}
                    className="w-full"
                    required
                  >
                    <option value="">Select target product type</option>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              </div>

              {/* Styling Strength */}
              <div className="space-y-2.5 rounded-lg border border-border/80 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">Styling Affinity</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="size-3.5 text-muted-foreground cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Strength (1–100) determines ranking priority when multiple complementary
                          products match the customer&apos;s style.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary">
                      {getStrengthLabel(strength)}
                    </span>
                    <span className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs font-bold tabular-nums">
                      {strength}%
                    </span>
                  </div>
                </div>

                <div className="pt-1">
                  <Slider
                    min={1}
                    max={100}
                    step={1}
                    value={[strength]}
                    onValueChange={(val) => {
                      const next = Array.isArray(val) ? val[0] : val;
                      if (typeof next === 'number') setStrength(next);
                    }}
                    disabled={busy}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>1% (Low)</span>
                  <span>50% (Standard)</span>
                  <span>100% (Maximum)</span>
                </div>
              </div>

              {/* Rule Enablement Switch */}
              <div className="flex items-center justify-between rounded-lg border border-border/80 bg-card p-3">
                <div className="space-y-0.5">
                  <label
                    htmlFor="rule-enabled-switch"
                    className="text-xs font-semibold text-foreground cursor-pointer"
                  >
                    Enable this rule
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Active rules immediately influence candidate scoring in storefront discovery.
                  </p>
                </div>
                <Switch
                  id="rule-enabled-switch"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  disabled={busy}
                />
              </div>
            </div>
          </div>

          <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !sourceType || !targetType}>
              {busy ? 'Saving…' : editingRule ? 'Update rule' : 'Create rule'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
