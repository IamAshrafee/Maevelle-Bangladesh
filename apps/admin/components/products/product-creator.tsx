'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { BasicInfoCard } from './creator/basic-info-card';
import { CreatorHeader } from './creator/creator-header';
import { CustomerDetailsCard } from './creator/customer-details-card';
import { DraftRecoveryAlert } from './creator/draft-recovery-alert';
import { MediaCard } from './creator/media-card';
import { OrganizationSidebar } from './creator/organization-sidebar';
import { PricingCard } from './creator/pricing-card';
import { SectionNavStrip } from './creator/section-nav-strip';
import { SeoContentCard } from './creator/seo-content-card';
import { ShippingCard } from './creator/shipping-card';
import { useProductCreatorState } from './creator/use-product-creator-state';
import { VariantsCard } from './creator/variants-card';

export interface ProductCreatorProps {
  readonly productId?: string | undefined;
}

export function ProductCreator({ productId }: ProductCreatorProps = {}) {
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section');
  const state = useProductCreatorState({ productId });

  useEffect(() => {
    if (!state.loading && sectionParam) {
      const normalized = sectionParam.toLowerCase();
      const el =
        document.getElementById(`section-${normalized}`) || document.getElementById(normalized);
      if (el) {
        // Small delay to ensure browser layout has stabilized after loading state
        const timer = setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [state.loading, sectionParam]);

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

      {/* Sticky Section Navigation Strip */}
      <SectionNavStrip />

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
            <AlertDescription className="text-xs">{state.generalError}</AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {state.successMessage && (
          <Alert className="border-success/30 bg-success/10 text-success shadow-xs">
            <CheckCircle2 className="size-4 text-success" />
            <AlertTitle className="text-foreground font-semibold">Success</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              {state.successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN: Core Product Attributes, Media, Pricing, Matrix, Shipping, Content */}
          <div className="space-y-6 lg:col-span-8">
            {/* Card 1: Basic Information */}
            <section id="section-overview" className="scroll-mt-28" aria-label="Product Overview">
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
                onToggleHandleLock={state.handleToggleHandleLock}
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
            </section>

            {/* Card 2: Product Media & Gallery */}
            <section id="section-media" className="scroll-mt-28" aria-label="Product Media">
              <MediaCard
                mediaItems={state.mediaItems}
                isDraggingOver={state.isDraggingOver}
                fileInputRef={state.fileInputRef}
                onFilesSelected={(files, targetScope) =>
                  void state.handleFilesSelected(files, targetScope)
                }
                onSetDraggingOver={state.setIsDraggingOver}
                onSetPrimaryMedia={state.handleSetPrimaryMedia}
                onRemoveMedia={state.handleRemoveMedia}
                onUpdateMediaAlt={state.handleUpdateMediaAlt}
                onMoveMedia={state.handleMoveMedia}
                onUpdateMediaScope={state.handleUpdateMediaScope}
                onAddExistingAssets={state.handleAddExistingAssets}
                scopeOptions={state.scopeOptions}
              />
            </section>

            {/* Card 3: Pricing & Margins */}
            <section id="section-pricing" className="scroll-mt-28" aria-label="Pricing and Margins">
              <PricingCard
                variantMode={state.variantMode}
                priceAmount={state.priceAmount}
                compareAtAmount={state.compareAtAmount}
                costAmount={state.costAmount}
                acquisitionCost={state.simpleAcquisitionCost}
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
                  state.setEstimatedCostAmount(val);
                  state.setIsDirty(true);
                }}
              />
            </section>

            {/* Card 4: Variants & Multi-Variant Matrix */}
            <section
              id="section-variants"
              className="scroll-mt-28"
              aria-label="Variants and Matrix"
            >
              <VariantsCard
                variantMode={state.variantMode}
                sku={state.sku}
                barcode={state.barcode}
                optionAxes={state.optionAxes}
                matrixRows={state.matrixRows}
                colors={state.references.colors}
                locations={state.references.locations}
                sizeSystemId={state.sizeSystemId}
                priceAmount={state.priceAmount}
                compareAtAmount={state.compareAtAmount}
                costAmount={state.costAmount}
                estimatedCostAmount={state.estimatedCostAmount}
                simpleInitialStock={state.simpleInitialStock}
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
                onSimpleInitialStockChange={(locationId, quantity) => {
                  state.setSimpleInitialStock((prev) => {
                    const existing = prev.find((s) => s.locationId === locationId);
                    if (existing) {
                      return prev.map((s) =>
                        s.locationId === locationId ? { ...s, quantity } : s,
                      );
                    }
                    return [...prev, { locationId, quantity }];
                  });
                  state.setIsDirty(true);
                }}
                onAddOptionValue={state.addOptionValue}
                onRemoveOptionValue={state.removeOptionValue}
                onSetPrimaryVisualValue={state.setPrimaryVisualValue}
                onToggleAxisVisual={state.toggleAxisVisual}
                onAddOptionAxis={state.addOptionAxis}
                onRemoveOptionAxis={state.removeOptionAxis}
                onApplyPresetStructure={state.applyPresetStructure}
                onImportSizesFromSystem={state.importSizesFromSystem}
                onUpdateMatrixRow={state.handleUpdateMatrixRow}
                onBulkUpdateMatrix={state.handleBulkUpdateMatrix}
                onToggleAllVariants={state.handleToggleAllVariants}
                onRegenerateAllSkus={state.handleRegenerateAllSkus}
              />
            </section>

            {/* Card 5: Shipping & Logistics */}
            <section
              id="section-shipping"
              className="scroll-mt-28"
              aria-label="Shipping and Logistics"
            >
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
            </section>

            {/* Customer-facing grouped information and FAQs */}
            <section
              id="section-content"
              className="scroll-mt-28"
              aria-label="Customer Information and FAQs"
            >
              <CustomerDetailsCard
                attributes={state.activeAttributes}
                attributeValues={state.attributeValues}
                informationGroups={state.informationGroups}
                faqs={state.faqs}
                error={state.fieldErrors.content}
                onAddGroup={state.addInformationGroup}
                onUpdateGroupTitle={state.updateInformationGroupTitle}
                onRemoveGroup={state.removeInformationGroup}
                onAddItem={state.addInformationItem}
                onUpdateItem={state.updateInformationItem}
                onRemoveItem={state.removeInformationItem}
                onAddFaq={state.addFaq}
                onUpdateFaq={state.updateFaq}
                onRemoveFaq={state.removeFaq}
              />
            </section>

            {/* Optional search metadata */}
            <section
              id="section-seo"
              className="scroll-mt-28"
              aria-label="Search Engine Optimization"
            >
              <SeoContentCard
                title={state.title}
                handle={state.handle}
                description={state.description}
                seoTitle={state.seoTitle}
                seoDescription={state.seoDescription}
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
              />
            </section>
          </div>

          {/* RIGHT COLUMN: Merchandising Sidebar (Readiness, Categories, Sizing, Tags) */}
          <div className="space-y-6 lg:col-span-4">
            <section
              id="section-merchandising"
              className="scroll-mt-28"
              aria-label="Merchandising and Organization"
            >
              <OrganizationSidebar
                categories={state.references.categories}
                selectedCategoryIds={state.selectedCategoryIds}
                primaryCategoryId={state.primaryCategoryId}
                recommendedCategoryId={state.selectedProductType?.primaryCategoryId}
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
                sizingGuideSource={state.sizingGuideSource}
                noGuideReason={state.noGuideReason}
                publishImmediately={state.publishImmediately}
                readinessChecklist={state.readinessChecklist}
                onToggleCategory={state.handleToggleCategory}
                onSelectPrimaryCategory={state.handleSelectPrimaryCategory}
                onToggleTag={(id) => {
                  state.setSelectedTagIds((prev) =>
                    prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                  );
                  state.setIsDirty(true);
                }}
                onToggleOccasion={(id) => {
                  state.setSelectedOccasionIds((prev) =>
                    prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                  );
                  state.setIsDirty(true);
                }}
                onToggleCollection={(id) => {
                  state.setSelectedCollectionIds((prev) =>
                    prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                  );
                  state.setIsDirty(true);
                }}
                onSizeSystemChange={(sysId) => {
                  state.setSizeSystemId(sysId);
                  state.setSizeGuideId('');
                  state.setSizingGuideSource('CATEGORY');
                  state.setIsDirty(true);
                }}
                onSizeGuideChange={(guideId) => {
                  const guide = state.references.sizeGuides.find((item) => item.id === guideId);
                  const compatibleSystem =
                    guide?.sizeSystemId ??
                    state.references.sizingData.systems.find(
                      (system) => system.sizingDomainId === guide?.sizingDomainId,
                    )?.id;
                  if (compatibleSystem) state.setSizeSystemId(compatibleSystem);
                  state.setSizeGuideId(guideId);
                  state.setSizingGuideSource('DIRECT');
                  state.setIsDirty(true);
                }}
                onSizingGuideSourceChange={(source) => {
                  state.setSizingGuideSource(source);
                  if (source !== 'DIRECT') state.setSizeGuideId('');
                  if (source !== 'NONE') state.setNoGuideReason('');
                  state.setIsDirty(true);
                }}
                onNoGuideReasonChange={(reason) => {
                  state.setNoGuideReason(reason);
                  state.setIsDirty(true);
                }}
                onPublishImmediatelyChange={(val) => {
                  state.setPublishImmediately(val);
                  state.setIsDirty(true);
                }}
              />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export const ProductEditor = ProductCreator;
