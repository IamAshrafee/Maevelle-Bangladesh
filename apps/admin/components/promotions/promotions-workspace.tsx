'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  BadgePercent,
  CheckCircle2,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { AdminPage, PageActions, PageHeader } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { PromotionsStats } from './promotions-stats';
import { PromotionsTable } from './promotions-table';
import { CreatePromotionSheet } from './create-promotion-sheet';
import { EditPromotionDialog } from './edit-promotion-dialog';
import { PromotionDetailDrawer } from './promotion-detail-drawer';
import { AddCouponDialog } from './coupon-dialog';
import { PromotionStatusDialog } from './promotion-status-dialog';
import type { PromotionItem, PromotionStatus } from './types';

export function PromotionsWorkspace() {
  const [promotions, setPromotions] = React.useState<readonly PromotionItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Dialog & Drawer States
  const [createSheetOpen, setCreateSheetOpen] = React.useState(false);
  const [selectedDetailPromoId, setSelectedDetailPromoId] = React.useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);

  const [editingPromotion, setEditingPromotion] = React.useState<PromotionItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);

  const [couponTargetPromo, setCouponTargetPromo] = React.useState<PromotionItem | null>(null);
  const [addCouponOpen, setAddCouponOpen] = React.useState(false);

  const [statusTargetPromo, setStatusTargetPromo] = React.useState<PromotionItem | null>(null);
  const [statusTargetStatus, setStatusTargetStatus] = React.useState<PromotionStatus | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false);

  const loadPromotions = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiRequest<{ data: readonly PromotionItem[] }>('/admin/promotions');
      setPromotions(res.data ?? []);
    } catch (err) {
      setMessage({
        text: err instanceof ApiRequestError ? err.message : 'Promotions could not be loaded.',
        type: 'error',
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPromotions();
  }, [loadPromotions]);

  function showNotification(text: string, type: 'success' | 'error' = 'success') {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage((current) => (current?.text === text ? null : current));
    }, 4000);
  }

  // Handlers
  function handleSelectPromotion(promotion: PromotionItem) {
    setSelectedDetailPromoId(promotion.id);
    setDetailDrawerOpen(true);
  }

  function handleEditPromotion(promotion: PromotionItem) {
    setEditingPromotion(promotion);
    setEditDialogOpen(true);
  }

  function handleAddCoupon(promotion: PromotionItem) {
    setCouponTargetPromo(promotion);
    setAddCouponOpen(true);
  }

  function handleStatusChange(promotion: PromotionItem, targetStatus: PromotionStatus) {
    setStatusTargetPromo(promotion);
    setStatusTargetStatus(targetStatus);
    setStatusDialogOpen(true);
  }

  return (
    <AdminPage>
      {/* Page Header */}
      <PageHeader
        eyebrow="Commerce / Promotions"
        title="Promotions & Discounts"
        description="Create server-evaluated discounts, manage coupon codes, and review committed commercial order usage."
        actions={
          <PageActions>
            <RefreshButton
              onRefresh={() => void loadPromotions()}
              tooltip="Refresh campaigns"
            />
            <Button
              onClick={() => setCreateSheetOpen(true)}
              className="gap-1.5 shadow-xs"
            >
              <Plus className="size-4" />
              New Promotion
            </Button>
          </PageActions>
        }
      />

      {/* Floating Notification Banner */}
      <AnimatePresence>
        {message ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-medium shadow-xs ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Real-time KPI Stats Cards */}
      <PromotionsStats promotions={promotions} />

      {/* Interactive Promotions Table & Worklist */}
      <PromotionsTable
        promotions={promotions}
        loading={loading}
        onSelectPromotion={handleSelectPromotion}
        onEditPromotion={handleEditPromotion}
        onStatusChange={handleStatusChange}
        onAddCoupon={handleAddCoupon}
        onCreateNew={() => setCreateSheetOpen(true)}
      />

      {/* Slide-over Create Promotion Sheet */}
      <CreatePromotionSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        onSuccess={() => {
          showNotification('Promotion campaign created successfully.');
          void loadPromotions(true);
        }}
      />

      {/* Slide-over Promotion Detail Drawer */}
      <PromotionDetailDrawer
        promotionId={selectedDetailPromoId}
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        onEdit={(p) => {
          setDetailDrawerOpen(false);
          handleEditPromotion(p);
        }}
        onStatusChange={(p, status) => {
          setDetailDrawerOpen(false);
          handleStatusChange(p, status);
        }}
        onAddCoupon={(p) => {
          setDetailDrawerOpen(false);
          handleAddCoupon(p);
        }}
        onRefreshList={() => void loadPromotions(true)}
      />

      {/* Edit Promotion Dialog */}
      <EditPromotionDialog
        promotion={editingPromotion}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => {
          showNotification('Promotion campaign updated.');
          void loadPromotions(true);
          if (selectedDetailPromoId) {
            setSelectedDetailPromoId(null);
          }
        }}
      />

      {/* Add Coupon Code Dialog */}
      <AddCouponDialog
        promotion={couponTargetPromo}
        open={addCouponOpen}
        onOpenChange={setAddCouponOpen}
        onSuccess={() => {
          showNotification('Coupon code attached successfully.');
          void loadPromotions(true);
        }}
      />

      {/* Status Change Confirmation Dialog */}
      <PromotionStatusDialog
        promotion={statusTargetPromo}
        targetStatus={statusTargetStatus}
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        onSuccess={() => {
          showNotification(`Promotion status updated to ${statusTargetStatus}.`);
          void loadPromotions(true);
        }}
      />
    </AdminPage>
  );
}

