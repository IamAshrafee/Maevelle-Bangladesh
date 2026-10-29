'use client';

import * as React from 'react';
import { AlertCircle, Globe, HelpCircle, Loader2, MapPin, Sparkles } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GeographyNodeSelector } from './geography-node-selector';
import type { DeliveryPricingRule, GeographyNodeOption } from './types';

interface DeliveryPricingRuleDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly rule: DeliveryPricingRule | null; // null = create mode, non-null = edit mode
  readonly busy: boolean;
  readonly onSubmit: (data: {
    name: string;
    countryCode: string;
    geographyNodeId?: string | null | undefined;
    flatAmount: string;
    currency: string;
    priority: number;
    status: 'ACTIVE' | 'INACTIVE';
    version?: number | undefined;
  }) => Promise<void>;
}

export function DeliveryPricingRuleDialog({
  open,
  onOpenChange,
  rule,
  busy,
  onSubmit,
}: DeliveryPricingRuleDialogProps) {
  const isEditing = Boolean(rule);

  // Form states
  const [name, setName] = React.useState('');
  const [flatAmount, setFlatAmount] = React.useState('120.00');
  const [priority, setPriority] = React.useState(0);
  const [countryCode, setCountryCode] = React.useState('BD');
  const [currency, setCurrency] = React.useState('BDT');
  const [status, setStatus] = React.useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [scopeType, setScopeType] = React.useState<'NATIONWIDE' | 'GEOGRAPHIC'>('NATIONWIDE');
  const [selectedNode, setSelectedNode] = React.useState<GeographyNodeOption | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Sync state when dialog opens or rule changes
  React.useEffect(() => {
    if (open) {
      setError(null);
      if (rule) {
        setName(rule.name);
        setFlatAmount(rule.flat_amount);
        setPriority(rule.priority);
        setCountryCode(rule.country_code);
        setCurrency(rule.currency_code);
        setStatus(rule.status);
        if (rule.geography_node_id) {
          setScopeType('GEOGRAPHIC');
          setSelectedNode({
            id: rule.geography_node_id,
            name: rule.geography_node_name ?? 'Selected zone',
            localName: null,
            nodeType: rule.geography_node_type ?? 'DISTRICT',
            parentName: rule.geography_parent_name,
          });
        } else {
          setScopeType('NATIONWIDE');
          setSelectedNode(null);
        }
      } else {
        // Defaults for Create mode
        setName('');
        setFlatAmount('120.00');
        setPriority(0);
        setCountryCode('BD');
        setCurrency('BDT');
        setStatus('ACTIVE');
        setScopeType('NATIONWIDE');
        setSelectedNode(null);
      }
    }
  }, [open, rule]);

  // Preset helpers for common Bangladesh configurations
  function applyPreset(presetType: 'INSIDE_DHAKA' | 'OUTSIDE_DHAKA' | 'FREE_DELIVERY') {
    if (presetType === 'INSIDE_DHAKA') {
      setName('Inside Dhaka Standard');
      setFlatAmount('60.00');
      setPriority(10);
      setScopeType('GEOGRAPHIC');
    } else if (presetType === 'OUTSIDE_DHAKA') {
      setName('Outside Dhaka / Nationwide Delivery');
      setFlatAmount('120.00');
      setPriority(0);
      setScopeType('NATIONWIDE');
      setSelectedNode(null);
    } else if (presetType === 'FREE_DELIVERY') {
      setName('Nationwide Free Delivery Campaign');
      setFlatAmount('0.00');
      setPriority(20);
      setScopeType('NATIONWIDE');
      setSelectedNode(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Rule name is required.');
      return;
    }

    const cleanAmount = flatAmount.trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(cleanAmount)) {
      setError('Delivery charge must be a valid non-negative decimal amount (e.g. 120 or 60.00).');
      return;
    }

    if (scopeType === 'GEOGRAPHIC' && !selectedNode) {
      setError('Please select a geographic zone or switch the scope to Nationwide.');
      return;
    }

    try {
      await onSubmit({
        name: trimmedName,
        countryCode: countryCode.toUpperCase(),
        currency: currency.toUpperCase(),
        flatAmount: cleanAmount,
        priority: Number(priority),
        status,
        geographyNodeId: scopeType === 'GEOGRAPHIC' && selectedNode ? selectedNode.id : null,
        version: rule?.version,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The delivery rule could not be saved.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit delivery pricing rule' : 'New delivery pricing rule'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update delivery charge rate, priority precedence, or geographic coverage.'
                : 'Define server-owned delivery pricing. Rates automatically take effect on the next checkout calculation.'}
            </DialogDescription>
          </DialogHeader>

          {/* Quick presets (only in create mode) */}
          {!isEditing && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-muted/40 border border-border/60">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3 text-primary" />
                <span>Presets:</span>
              </span>
              <button
                type="button"
                onClick={() => applyPreset('OUTSIDE_DHAKA')}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-card border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Nationwide ৳120 (P0)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('INSIDE_DHAKA')}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-card border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Inside Dhaka ৳60 (P10)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('FREE_DELIVERY')}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-card border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Free Delivery ৳0 (P20)
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Rule Name */}
            <div className="space-y-1.5">
              <Label htmlFor="rule-name" className="text-xs font-medium">
                Rule name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Inside Dhaka Standard, Nationwide Delivery"
                required
                maxLength={160}
                className="h-9 text-xs"
              />
            </div>

            {/* Geographic Scope Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Geographic coverage scope</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setScopeType('NATIONWIDE');
                    setSelectedNode(null);
                  }}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors cursor-pointer ${
                    scopeType === 'NATIONWIDE'
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-border bg-card text-foreground hover:bg-muted/40'
                  }`}
                >
                  <Globe className="size-4 shrink-0" />
                  <div>
                    <strong className="block text-xs">Nationwide (All {countryCode})</strong>
                    <span className="text-[10px] text-muted-foreground">General fallback rate</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScopeType('GEOGRAPHIC')}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors cursor-pointer ${
                    scopeType === 'GEOGRAPHIC'
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-border bg-card text-foreground hover:bg-muted/40'
                  }`}
                >
                  <MapPin className="size-4 shrink-0" />
                  <div>
                    <strong className="block text-xs">Specific zone / city</strong>
                    <span className="text-[10px] text-muted-foreground">Division, District, Thana</span>
                  </div>
                </button>
              </div>

              {/* If Geographic scope selected, show GeographyNodeSelector */}
              {scopeType === 'GEOGRAPHIC' && (
                <div className="pt-1 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Target geography node <span className="text-destructive">*</span>
                  </Label>
                  <GeographyNodeSelector
                    value={selectedNode?.id ?? null}
                    initialNode={selectedNode}
                    onSelect={setSelectedNode}
                    placeholder="Search by Division, District, City, or Thana…"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Orders with addresses inside this node or its child territories will match this rule.
                  </p>
                </div>
              )}
            </div>

            {/* Rate & Priority Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Delivery Charge */}
              <div className="space-y-1.5">
                <Label htmlFor="rule-amount" className="text-xs font-medium">
                  Delivery charge ({currency}) <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    ৳
                  </span>
                  <Input
                    id="rule-amount"
                    value={flatAmount}
                    onChange={(e) => setFlatAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    required
                    className="h-9 pl-7 text-xs font-mono tabular-nums"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Exact flat rate quoted to customer in BDT
                </p>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rule-priority" className="text-xs font-medium flex items-center gap-1">
                    <span>Priority rank</span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="text-muted-foreground hover:text-foreground cursor-help inline-flex">
                            <HelpCircle className="size-3" />
                          </span>
                        }
                      >
                        <span className="sr-only">Priority details</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Higher priority rules take precedence over lower priority rules. Standard fallback rules
                        usually have priority 0, while regional zone overrides use 10 or 20.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                </div>
                <Input
                  id="rule-priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  required
                  className="h-9 text-xs font-mono tabular-nums"
                />
                <p className="text-[10px] text-muted-foreground">
                  Evaluation precedence integer (e.g. 0, 10, 20)
                </p>
              </div>
            </div>

            {/* Country, Currency & Status */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="rule-country" className="text-[11px] text-muted-foreground">
                  Country
                </Label>
                <Input
                  id="rule-country"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  maxLength={2}
                  required
                  className="h-8 text-xs font-mono uppercase"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rule-currency" className="text-[11px] text-muted-foreground">
                  Currency
                </Label>
                <Input
                  id="rule-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  required
                  className="h-8 text-xs font-mono uppercase"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rule-status" className="text-[11px] text-muted-foreground">
                  Status
                </Label>
                <NativeSelect
                  id="rule-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                  className="h-8 text-xs"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </NativeSelect>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              <span>{isEditing ? 'Save changes' : 'Create rule'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
