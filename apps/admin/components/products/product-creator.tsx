'use client';

import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { BasicInfoCard } from './creator/basic-info-card';
import { CreatorHeader } from './creator/creator-header';
import { DraftRecoveryAlert } from './creator/draft-recovery-alert';
import { MediaCard } from './creator/media-card';
import { OrganizationSidebar } from './creator/organization-sidebar';
import { PricingCard } from './creator/pricing-card';
import { SeoContentCard } from './creator/seo-content-card';
import { ShippingCard } from './creator/shipping-card';
import { useProductCreatorState } from './creator/use-product-creator-state';
import { VariantsCard } from './creator/variants-card';

export interface ProductCreatorProps {
  readonly productId?: string | undefined;
}

export function ProductCreator({ productId }: ProductCreatorProps = {}) {
  const state = useProductCreatorState({ productId });

  if (state.loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <LoaderCircle className="size-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          {productId
            ? 'Loading product workspace & catalog data…'
            : 'Loading catalog configuration and taxonomies…'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-muted/10 pb-20">
      {/* Sticky Top Action Bar */}
      <CreatorHeader
        isEditMode={state.isEditMode}
        productId={state.productId}
        productTitle={state.title}
        status={state.publicationStatus}
        saving={state.saving}
        isDirty={state.isDirty}
        onSaveDraft={() => void state.handleSubmit(undefined, 'DRAFT')}
        onPublish={() => void state.handleSubmit(undefined, 'ACTIVE')}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Unsaved Draft Recovery Alert */}
        {state.draftTimestamp && (
          <DraftRecoveryAlert
            timestamp={state.draftTimestamp}
            onRestore={state.handleRestoreDraft}
            onDiscard={state.handleDiscardDraft}
          />
        )}

        {/* Global Error Alert */}
        {state.generalError && (
          <Alert variant="destructive" className="shadow-xs">
            <AlertCircle className="size-4" />
            <AlertTitle>Unable to Save Product</AlertTitle>
            <AlertDescription className="text-xs">
              {state.generalError}
            </AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {state.successMessage && (
          <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription className="text-xs">
              {state.successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN: Core Product Attributes, Media, Pricing, Matrix, Shipping, Content */}
          <div className="space-y-6 lg:col-span-8">
            {/* Card 1: Basic Information */}
            <BasicInfoCard
              title={state.title}
              handle={state.handle}
              isHandleLocked={state.isHandleLocked}
              productTypeId={state.productTypeId}
              description={state.description}
              types={state.references.types}
              selectedProductType={state.selectedProductType}
              activeAttributes={state.activeAttributes}
              attributeValues={state.attributeValues}
              fieldErrors={state.fieldErrors}
              onTitleChange={state.handleTitleChange}
              onHandleChange={state.handleHandleChange}
              onToggleHandleLock={() =>
                state.setIsHandleLocked(!state.isHandleLocked)
              }
              onProductTypeChange={state.handleProductTypeChange}
              onAttributeChange={(attrId, val) => {
                state.setAttributeValues((prev) => ({ ...prev, [attrId]: val }));
                state.setIsDirty(true);
              }}
              onDescriptionChange={(desc) => {
                state.setDescription(desc);
                state.setIsDirty(true);
              }}
            />

            {/* Card 2: Product Media & Gallery */}
            <MediaCard
              mediaItems={state.mediaItems}
              isDraggingOver={state.isDraggingOver}
              fileInputRef={state.fileInputRef}
              onFilesSelected={(files) => void state.handleFilesSelected(files)}
              onSetDraggingOver={state.setIsDraggingOver}
              onSetPrimaryMedia={state.handleSetPrimaryMedia}
              onRemoveMedia={state.handleRemoveMedia}
              onUpdateMediaAlt={state.handleUpdateMediaAlt}
            />

            {/* Card 3: Pricing & Margins */}
            <PricingCard
              priceAmount={state.priceAmount}
              compareAtAmount={state.compareAtAmount}
              costAmount={state.costAmount}
              fieldErrors={state.fieldErrors}
              onPriceChange={(val) => {
                state.setPriceAmount(val);
                state.setIsDirty(true);
              }}
              onCompareAtChange={(val) => {
                state.setCompareAtAmount(val);
                state.setIsDirty(true);
              }}
              onCostChange={(val) => {
                state.setCostAmount(val);
                state.setIsDirty(true);
              }}
            />

            {/* Card 4: Variants & Multi-Variant Matrix */}
            <VariantsCard
              variantMode={state.variantMode}
              sku={state.sku}
              barcode={state.barcode}
              optionAxes={state.optionAxes}
              matrixRows={state.matrixRows}
              colors={state.references.colors}
              sizeSystemId={state.sizeSystemId}
              priceAmount={state.priceAmount}
              compareAtAmount={state.compareAtAmount}
              costAmount={state.costAmount}
              fieldErrors={state.fieldErrors}
              onVariantModeChange={(mode) => {
                state.setVariantMode(mode);
                state.setIsDirty(true);
              }}
              onSkuChange={(val) => {
                state.setSku(val.toUpperCase());
                state.setSkuEdited(true);
                state.setIsDirty(true);
              }}
              onBarcodeChange={(val) => {
                state.setBarcode(val);
                state.setIsDirty(true);
              }}
              onAddOptionValue={state.addOptionValue}
              onRemoveOptionValue={state.removeOptionValue}
              onImportSizesFromSystem={state.importSizesFromSystem}
              onUpdateMatrixRow={state.handleUpdateMatrixRow}
              onBulkUpdateMatrix={state.handleBulkUpdateMatrix}
              onToggleAllVariants={state.handleToggleAllVariants}
              onRegenerateAllSkus={state.handleRegenerateAllSkus}
            />

            {/* Card 5: Shipping & Logistics */}
            <ShippingCard
              weightValue={state.weightValue}
              onWeightValueChange={(v) => {
                state.setWeightValue(v);
                state.setIsDirty(true);
              }}
              weightUnit={state.weightUnit}
              onWeightUnitChange={(u) => {
                state.setWeightUnit(u);
                state.setIsDirty(true);
              }}
              lengthValue={state.lengthValue}
              onLengthValueChange={(v) => {
                state.setLengthValue(v);
                state.setIsDirty(true);
              }}
              widthValue={state.widthValue}
              onWidthValueChange={(v) => {
                state.setWidthValue(v);
                state.setIsDirty(true);
              }}
              heightValue={state.heightValue}
              onHeightValueChange={(v) => {
                state.setHeightValue(v);
                state.setIsDirty(true);
              }}
              dimensionUnit={state.dimensionUnit}
              onDimensionUnitChange={(u) => {
                state.setDimensionUnit(u);
                state.setIsDirty(true);
              }}
            />

            {/* Card 6: SEO & Customer Content */}
            <SeoContentCard
              title={state.title}
              handle={state.handle}
              description={state.description}
              seoTitle={state.seoTitle}
              seoDescription={state.seoDescription}
              highlights={state.highlights}
              faqs={state.faqs}
              showAdvancedContent={state.showAdvancedContent}
              onToggleAdvancedContent={() =>
                state.setShowAdvancedContent(!state.showAdvancedContent)
              }
              onSeoTitleChange={(v) => {
                state.setSeoTitle(v);
                state.setIsDirty(true);
              }}
              onSeoDescriptionChange={(v) => {
                state.setSeoDescription(v);
                state.setIsDirty(true);
              }}
              onAddHighlight={state.addHighlight}
              onUpdateHighlight={state.updateHighlight}
              onRemoveHighlight={state.removeHighlight}
              onAddFaq={state.addFaq}
              onUpdateFaq={state.updateFaq}
              onRemoveFaq={state.removeFaq}
            />
          </div>

          {/* RIGHT COLUMN: Merchandising Sidebar (Readiness, Categories, Sizing, Tags) */}
          <div className="space-y-6 lg:col-span-4">
            <OrganizationSidebar
              categories={state.references.categories}
              selectedCategoryIds={state.selectedCategoryIds}
              primaryCategoryId={state.primaryCategoryId}
              tags={state.references.tags}
              selectedTagIds={state.selectedTagIds}
              occasions={state.references.occasions}
              selectedOccasionIds={state.selectedOccasionIds}
              collections={state.references.collections}
              selectedCollectionIds={state.selectedCollectionIds}
              sizingData={state.references.sizingData}
              sizeGuides={state.references.sizeGuides}
              sizeSystemId={state.sizeSystemId}
              sizeGuideId={state.sizeGuideId}
              publishImmediately={state.publishImmediately}
              readinessChecklist={state.readinessChecklist}
              onToggleCategory={state.handleToggleCategory}
              onSelectPrimaryCategory={state.handleSelectPrimaryCategory}
              onToggleTag={(id) => {
                state.setSelectedTagIds((prev) =>
                  prev.includes(id)
                    ? prev.filter((item) => item !== id)
                    : [...prev, id],
                );
                state.setIsDirty(true);
              }}
              onToggleOccasion={(id) => {
                state.setSelectedOccasionIds((prev) =>
                  prev.includes(id)
                    ? prev.filter((item) => item !== id)
                    : [...prev, id],
                );
                state.setIsDirty(true);
              }}
              onToggleCollection={(id) => {
                state.setSelectedCollectionIds((prev) =>
                  prev.includes(id)
                    ? prev.filter((item) => item !== id)
                    : [...prev, id],
                );
                state.setIsDirty(true);
              }}
              onSizeSystemChange={(sysId) => {
                state.setSizeSystemId(sysId);
                state.setSizeGuideId('');
                state.setIsDirty(true);
              }}
              onSizeGuideChange={(guideId) => {
                state.setSizeGuideId(guideId);
                state.setIsDirty(true);
              }}
              onPublishImmediatelyChange={(val) => {
                state.setPublishImmediately(val);
                state.setIsDirty(true);
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export const ProductEditor = ProductCreator;
