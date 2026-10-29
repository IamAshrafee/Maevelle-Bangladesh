'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { Truck, CheckCircle2, Globe, MapPin } from 'lucide-react';

import { type DeliveryPricingRule, formatMoney } from './types';

interface DeliveryPricingStatsProps {
  rules: readonly DeliveryPricingRule[];
}

export function DeliveryPricingStats({ rules }: DeliveryPricingStatsProps) {
  const total = rules.length;
  const activeRules = rules.filter((r) => r.status === 'ACTIVE');
  const activeCount = activeRules.length;
  const activePct = total > 0 ? Math.round((activeCount / total) * 100) : 0;

  // Find standard nationwide rule (BD, no geography node, active)
  const nationwideActive = activeRules.find(
    (r) => r.country_code === 'BD' && !r.geography_node_id,
  );

  // Geographic rules
  const geographicActive = activeRules.filter((r) => Boolean(r.geography_node_id));

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
      {/* Active Rules Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">Active rules</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums font-mono">
            {activeCount}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums font-mono">
            / {total} ({activePct}%)
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Actively pricing customer checkouts</p>
      </motion.div>

      {/* Nationwide Standard Rate */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, delay: 0.03 }}
        className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">Standard BD rate</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="size-4" />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1.5">
          {nationwideActive ? (
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums font-mono">
              {formatMoney(nationwideActive.flat_amount, nationwideActive.currency_code)}
            </span>
          ) : (
            <span className="text-base sm:text-lg font-semibold text-amber-600 dark:text-amber-400">
              Not configured
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {nationwideActive ? nationwideActive.name : 'Fallback rate for general addresses'}
        </p>
      </motion.div>

      {/* Geographic Overrides */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, delay: 0.06 }}
        className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">Zone overrides</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <MapPin className="size-4" />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums font-mono">
            {geographicActive.length}
          </span>
          <span className="text-xs text-muted-foreground">regional rules</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Division, District or Thana specific</p>
      </motion.div>

      {/* Total Configured */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, delay: 0.09 }}
        className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">Total rules</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Truck className="size-4" />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums font-mono">
            {total}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums font-mono">
            ({total - activeCount} inactive)
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Managed server-side pricing rules</p>
      </motion.div>
    </div>
  );
}

