'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Globe,
  MapPin,
  Sparkles,
  Loader2,
  RotateCcw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchApiData } from '@/lib/api';
import { GeographyNodeSelector } from './geography-node-selector';
import {
  type DeliveryPricingRule,
  type DeliveryQuoteSimulation,
  type GeographyNodeOption,
  formatMoney,
} from './types';

interface DeliveryPricingSimulatorProps {
  readonly rules: readonly DeliveryPricingRule[];
  readonly targetRule?: DeliveryPricingRule | null;
  readonly onClearTarget?: () => void;
}

export function DeliveryPricingSimulator({
  rules,
  targetRule,
  onClearTarget,
}: DeliveryPricingSimulatorProps) {
  const [selectedNode, setSelectedNode] = React.useState<GeographyNodeOption | null>(null);
  const [currency] = React.useState('BDT');
  const [countryCode] = React.useState('BD');
  const [simulating, setSimulating] = React.useState(false);
  const [result, setResult] = React.useState<DeliveryQuoteSimulation | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // If a target rule is passed in from "Test in Simulator" button
  React.useEffect(() => {
    if (targetRule) {
      if (targetRule.geography_node_id && targetRule.geography_node_name) {
        setSelectedNode({
          id: targetRule.geography_node_id,
          name: targetRule.geography_node_name,
          localName: null,
          nodeType: targetRule.geography_node_type ?? 'DISTRICT',
          parentName: targetRule.geography_parent_name,
        });
      } else {
        setSelectedNode(null);
      }
      setResult(null);
      setError(null);
    }
  }, [targetRule]);

  async function handleSimulate() {
    setSimulating(true);
    setError(null);
    try {
      const response = await fetchApiData<DeliveryQuoteSimulation>(
        '/admin/orders/delivery-pricing-rules/simulate',
        {
          method: 'POST',
          body: JSON.stringify({
            countryCode,
            currency,
            geographyNodeId: selectedNode?.id || undefined,
          }),
        },
      );
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delivery quote could not be simulated.');
      setResult(null);
    } finally {
      setSimulating(false);
    }
  }

  function handleReset() {
    setSelectedNode(null);
    setResult(null);
    setError(null);
    onClearTarget?.();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Calculator className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Delivery fee simulator</h3>
            <p className="text-xs text-muted-foreground">
              Test server-side quote resolution for any address or zone in Bangladesh
            </p>
          </div>
        </div>

        {targetRule && (
          <Badge variant="outline" className="text-xs h-6 gap-1 bg-primary/5 text-primary border-primary/20">
            <Sparkles className="size-3" />
            <span>Targeting: {targetRule.name}</span>
          </Badge>
        )}
      </div>

      {/* Simulator Inputs */}
      <div className="grid gap-3 sm:grid-cols-12 items-end">
        {/* Destination Geography */}
        <div className="sm:col-span-8 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-medium text-foreground">Destination address / zone</label>
            <span className="text-muted-foreground text-[11px]">
              {selectedNode ? 'Specific regional address' : 'Nationwide Bangladesh (All BD)'}
            </span>
          </div>

          <GeographyNodeSelector
            value={selectedNode?.id ?? null}
            initialNode={selectedNode}
            onSelect={setSelectedNode}
            placeholder="Select division, district, or thana (or leave empty for nationwide BD)…"
          />
        </div>

        {/* Currency & Action Buttons */}
        <div className="sm:col-span-4 flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void handleSimulate()}
            disabled={simulating}
            className="flex-1 h-9 text-xs gap-1.5"
          >
            {simulating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            <span>Calculate fee</span>
          </Button>

          {(selectedNode || result || error || targetRule) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Reset simulation"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Simulation Outcome Result */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className={`rounded-lg border p-4 text-xs ${
              result.matched && result.quote
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200'
                : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200'
            }`}
          >
            {result.matched && result.quote ? (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 dark:border-emerald-800/40 pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-semibold text-sm text-foreground">
                      Quote Resolved: {formatMoney(result.quote.amount, result.quote.currency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[11px] h-5 bg-background font-mono tabular-nums">
                      Priority P{result.quote.priority ?? 0}
                    </Badge>
                    <Badge variant="success" className="text-[11px] h-5">
                      Server-owned quote
                    </Badge>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-2 text-muted-foreground pt-1">
                  <div>
                    <span className="font-medium text-foreground">Winning rule: </span>
                    <strong className="text-foreground">{result.quote.ruleName}</strong>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Scope resolved: </span>
                    <span>
                      {result.quote.geographyNodeName ? (
                        <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
                          <MapPin className="size-3" />
                          <span>
                            {result.quote.geographyNodeName}
                            {result.quote.geographyNodeType ? ` (${result.quote.geographyNodeType})` : ''}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Globe className="size-3" />
                          <span>Nationwide fallback ({countryCode})</span>
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground italic border-t border-emerald-200/40 dark:border-emerald-800/20 pt-1.5">
                  Resolution reasoning: Highest priority active rule with the closest geographic ancestry match was snapshot.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-semibold text-foreground">
                    No active pricing rule matched this address
                  </strong>
                  <p className="text-muted-foreground">
                    {result.reason ??
                      'Checkout will display an error and reject placement for this destination until an active rule is created.'}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2"
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

