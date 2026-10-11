'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  CatalogCategoryChoiceDto,
  CatalogColorDto,
  CatalogProductTypeDefinitionDto,
  CatalogProductWorkspaceDto,
  CatalogVocabularyListDto,
  SaveCatalogProductWorkspaceDto,
  SizeGuideSummaryDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { catalogData, CatalogRequestError, productMediaUrl } from '@/lib/catalog/api';

import type {
  OptionAxisState,
  MediaCardScopeOption,
  ProductCreatorReferences,
  ShippingPreset,
  SizingReferenceData,
  VariantMatrixRow,
  VariantStockEntry,
} from './types';

// Sub-modules and utilities
import { slugify, generateSkuPrefix, generateVariantSku } from './utils/sku-generator';
import { contentGroupsPayload, customerContentValidationError } from './utils/content-validation';
import { SHIPPING_PRESETS } from './utils/shipping-presets';
import { useCreatorContent } from './hooks/use-creator-content';
import { useCreatorMedia } from './hooks/use-creator-media';
import { useCreatorVariantsMatrix } from './hooks/use-creator-variants-matrix';
import { useCreatorReadiness } from './hooks/use-creator-readiness';
import { useCreatorDraft, DRAFT_STORAGE_KEY, getDraftStorageKey } from './hooks/use-creator-draft';

export {
  DRAFT_STORAGE_KEY,
  getDraftStorageKey,
  SHIPPING_PRESETS,
  slugify,
  generateSkuPrefix,
  generateVariantSku,
};

export function useProductCreatorState({
  productId,
}: {
  productId?: string | undefined;
} = {}) {
  const router = useRouter();
  const isEditMode = Boolean(productId);

  // General Lifecycle State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStatusText] = useState('Saving product workspace…');
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Workspace Metadata
  const [workspaceData, setWorkspaceData] = useState<CatalogProductWorkspaceDto | null>(null);
  const [productVersion, setProductVersion] = useState<number>(1);
  const [productStatus, setProductStatus] = useState<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>('DRAFT');
  const [publicationStatus, setPublicationStatus] = useState<'PUBLISHED' | 'UNPUBLISHED'>(
    'UNPUBLISHED',
  );

  // Reference Taxonomies
  const [references, setReferences] = useState<ProductCreatorReferences>({
    types: [],
    categories: [],
    colors: [],
    tags: [],
    occasions: [],
    collections: [],
    sizingData: { systems: [], sizeDefinitions: [] },
    sizeGuides: [],
    locations: [],
  });

  // Core Identity
  const [title, setTitle] = useState('');
  const [handle, setHandle] = useState('');
  const [isHandleLocked, setIsHandleLocked] = useState(true);
  const [productTypeId, setProductTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [attributeValues, setAttributeValues] = useState<Record<string, string | boolean | null>>(
    {},
  );

  // Sizing
  const [sizeSystemId, setSizeSystemId] = useState('');
  const [sizeGuideId, setSizeGuideId] = useState('');

  // Taxonomies
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [primaryCategoryId, setPrimaryCategoryId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedOccasionIds, setSelectedOccasionIds] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  // Base Pricing
  const [priceAmount, setPriceAmount] = useState('');
  const [compareAtAmount, setCompareAtAmount] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [estimatedCostAmount, setEstimatedCostAmount] = useState('');

  // Shipping
  const [weightValue, setWeightValue] = useState('400');
  const [weightUnit, setWeightUnit] = useState<'G' | 'KG'>('G');
  const [lengthValue, setLengthValue] = useState('30');
  const [widthValue, setWidthValue] = useState('25');
  const [heightValue, setHeightValue] = useState('4');
  const [dimensionUnit, setDimensionUnit] = useState<'CM' | 'MM' | 'IN'>('CM');

  // SEO
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  // Publishing Intent
  const [publishImmediately, setPublishImmediately] = useState(false);

  // --------------------------------------------------------------------------
  // Sub-Hooks Composition
  // --------------------------------------------------------------------------
  const selectedProductType = useMemo(
    () => references.types.find((t) => t.id === productTypeId),
    [references.types, productTypeId],
  );

  const activeAttributes = useMemo(
    () =>
      selectedProductType?.attributes?.filter(
        (attribute) => attribute.status === 'ACTIVE' && attribute.scope === 'PRODUCT',
      ) ?? [],
    [selectedProductType],
  );

  const content = useCreatorContent(() => setIsDirty(true));

  const variants = useCreatorVariantsMatrix({
    title,
    selectedProductType,
    references,
    priceAmount,
    compareAtAmount,
    costAmount,
    estimatedCostAmount,
    weightValue,
    weightUnit,
    lengthValue,
    widthValue,
    heightValue,
    dimensionUnit,
    onDirty: () => setIsDirty(true),
  });

  const media = useCreatorMedia({
    isEditMode,
    workspaceData,
    title,
    optionAxes: variants.optionAxes,
    onError: (msg) => setGeneralError(msg),
    onDirty: () => setIsDirty(true),
  });

  const draft = useCreatorDraft({
    productId,
    isEditMode,
    isDirty,
    loading,
    getDraftData: () => ({
      title,
      handle,
      productTypeId,
      description,
      selectedCategoryIds,
      primaryCategoryId,
      selectedTagIds,
      selectedOccasionIds,
      selectedCollectionIds,
      sizeSystemId,
      sizeGuideId,
      attributeValues,
      variantMode: variants.variantMode,
      priceAmount,
      compareAtAmount,
      costAmount,
      estimatedCostAmount: estimatedCostAmount || costAmount,
      initialStock: variants.simpleInitialStock,
      sku: variants.sku,
      barcode: variants.barcode,
      optionAxes: variants.optionAxes,
      matrixRows: variants.matrixRows,
      weightValue,
      weightUnit,
      lengthValue,
      widthValue,
      heightValue,
      dimensionUnit,
      seoTitle,
      seoDescription,
      informationGroups: content.informationGroups,
      faqs: content.faqs,
    }),
    onRestore: (d) => {
      setTitle(d.title || '');
      setHandle(d.handle || '');
      if (d.productTypeId) setProductTypeId(d.productTypeId);
      setDescription(d.description || '');
      setSelectedCategoryIds([...(d.selectedCategoryIds || [])]);
      setPrimaryCategoryId(d.primaryCategoryId || '');
      setSelectedTagIds([...(d.selectedTagIds || [])]);
      setSelectedOccasionIds([...(d.selectedOccasionIds || [])]);
      setSelectedCollectionIds([...(d.selectedCollectionIds || [])]);
      setSizeSystemId(d.sizeSystemId || '');
      setSizeGuideId(d.sizeGuideId || '');
      setAttributeValues(d.attributeValues || {});
      variants.setVariantMode(d.variantMode || 'simple');
      setPriceAmount(d.priceAmount || '');
      setCompareAtAmount(d.compareAtAmount || '');
      setCostAmount(d.costAmount || '');
      setEstimatedCostAmount(d.estimatedCostAmount || d.costAmount || '');
      variants.setSimpleInitialStock((d.initialStock as VariantStockEntry[]) || []);
      variants.setSku(d.sku || '');
      variants.setBarcode(d.barcode || '');
      if (d.optionAxes && d.optionAxes.length > 0)
        variants.setOptionAxes(d.optionAxes as OptionAxisState[]);
      if (d.matrixRows && d.matrixRows.length > 0)
        variants.setMatrixRows(d.matrixRows as VariantMatrixRow[]);
      setWeightValue(d.weightValue || '400');
      setWeightUnit(d.weightUnit || 'G');
      setLengthValue(d.lengthValue || '30');
      setWidthValue(d.widthValue || '25');
      setHeightValue(d.heightValue || '4');
      setDimensionUnit(d.dimensionUnit || 'CM');
      setSeoTitle(d.seoTitle || '');
      setSeoDescription(d.seoDescription || '');
      content.setInformationGroups(
        d.informationGroups
          ? d.informationGroups.map((group) => ({ ...group, items: [...group.items] }))
          : d.highlights?.length
            ? [{ id: `legacy-${Date.now()}`, title: 'Product Details', items: [...d.highlights] }]
            : [],
      );
      content.setFaqs([...(d.faqs || [])]);
      setIsDirty(true);
    },
    onError: (msg) => setGeneralError(msg),
  });

  const readinessChecklist = useCreatorReadiness({
    title,
    productTypeId,
    primaryCategoryId,
    selectedCategoryIds,
    priceAmount,
    variantMode: variants.variantMode,
    sku: variants.sku,
    matrixRows: variants.matrixRows,
    mediaItems: media.mediaItems,
  });

  // --------------------------------------------------------------------------
  // Scope Options for Media Cards
  // --------------------------------------------------------------------------
  const scopeOptions = useMemo<MediaCardScopeOption[]>(() => {
    const options: MediaCardScopeOption[] = [];
    const visualAxis = variants.activeAxes.find((a) => a.isVisual);
    if (visualAxis) {
      for (const val of visualAxis.values) {
        options.push({
          id: `color-${val.id}`,
          label: val.label,
          groupLabel: visualAxis.name,
          type: 'COLOR',
          optionValueRef: val.id,
          optionValueId: isEditMode && !val.id.startsWith('optval-') ? val.id : undefined,
          isPrimary: Boolean(val.isPrimary),
          colorHex: val.colorHex ?? null,
        });
      }
    }
    if (variants.variantMode === 'variants') {
      for (const row of variants.matrixRows) {
        if (row.enabled && row.sku) {
          options.push({
            id: `variant-${row.id}`,
            label: `${row.sku} · ${row.optionSelections.map((s) => s.valueDisplay).join(' / ') || row.title}`,
            type: 'VARIANT',
            variantRef: row.id,
            variantId:
              isEditMode && workspaceData?.variants.some((v) => v.id === row.id)
                ? row.id
                : undefined,
          });
        }
      }
    }
    return options;
  }, [variants.activeAxes, variants.matrixRows, variants.variantMode, workspaceData, isEditMode]);

  // --------------------------------------------------------------------------
  // Fetch Reference Data on Mount
  // --------------------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    void Promise.all([
      catalogData<readonly CatalogProductTypeDefinitionDto[]>(
        '/admin/catalog/product-type-definitions',
        { signal: controller.signal },
      ),
      catalogData<readonly CatalogCategoryChoiceDto[]>('/admin/catalog/categories', {
        signal: controller.signal,
      }),
      catalogData<readonly CatalogColorDto[]>('/admin/catalog/colors', {
        signal: controller.signal,
      }),
      catalogData<CatalogVocabularyListDto>(
        '/admin/catalog/vocabulary/TAG?status=ACTIVE&page=1&pageSize=100',
        { signal: controller.signal },
      ),
      catalogData<CatalogVocabularyListDto>(
        '/admin/catalog/vocabulary/OCCASION?status=ACTIVE&page=1&pageSize=100',
        { signal: controller.signal },
      ),
      catalogData<CatalogVocabularyListDto>(
        '/admin/catalog/vocabulary/COLLECTION?status=ACTIVE&page=1&pageSize=100',
        { signal: controller.signal },
      ),
      catalogData<SizingReferenceData>('/admin/sizing', { signal: controller.signal }).catch(
        () => ({
          systems: [],
          sizeDefinitions: [],
        }),
      ),
      catalogData<readonly SizeGuideSummaryDto[]>('/admin/sizing/guides', {
        signal: controller.signal,
      }).catch(() => []),
      catalogData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations', {
        signal: controller.signal,
      }).catch(() => []),
      isEditMode && productId
        ? catalogData<CatalogProductWorkspaceDto>(`/admin/catalog/products/${productId}`, {
            signal: controller.signal,
          }).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(
        ([
          typesData,
          catData,
          colorData,
          tagData,
          occData,
          collData,
          sizing,
          guidesData,
          locationsData,
          workspace,
        ]) => {
          if (controller.signal.aborted) return;
          setReferences({
            types: typesData,
            categories: catData,
            colors: colorData,
            tags: tagData.items,
            occasions: occData.items,
            collections: collData.items,
            sizingData: sizing,
            sizeGuides: guidesData,
            locations: locationsData || [],
          });

          if (workspace) {
            setWorkspaceData(workspace);
            setTitle(workspace.title);
            setHandle(workspace.handle);
            setIsHandleLocked(false);
            setProductTypeId(workspace.productTypeId);
            setDescription(workspace.description || '');
            setSelectedCategoryIds([...(workspace.organization.categoryIds || [])]);
            setPrimaryCategoryId(workspace.organization.primaryCategoryId || '');
            setSelectedTagIds([...(workspace.organization.tagIds || [])]);
            setSelectedOccasionIds([...(workspace.organization.occasionIds || [])]);
            setSelectedCollectionIds([...(workspace.organization.collectionIds || [])]);
            setSizeSystemId(workspace.sizeSystemId || '');
            setSizeGuideId(workspace.sizeGuideId || '');

            const attrs: Record<string, string | boolean | null> = {};
            (workspace.organization.attributes || []).forEach((a) => {
              if (a.value !== null && a.value !== undefined) {
                attrs[a.id] = a.value;
              }
            });
            setAttributeValues(attrs);

            media.setMediaItems(
              (workspace.media || []).map((m) => ({
                id: m.id,
                assetId: m.assetId,
                previewUrl: productMediaUrl(m.assetId, 'PUBLIC'),
                isPrimary: m.isPrimary,
                role: m.role,
                variantId: m.variantId,
                optionValueId: m.optionValueId,
                position: m.position,
                altText: m.altText || m.title || '',
                isUploading: false,
              })),
            );

            if (workspace.shipping?.weight) {
              setWeightValue(workspace.shipping.weight.value);
              setWeightUnit((workspace.shipping.weight.unit as 'G' | 'KG') || 'G');
            }
            if (workspace.shipping?.dimensions) {
              setLengthValue(workspace.shipping.dimensions.length);
              setWidthValue(workspace.shipping.dimensions.width);
              setHeightValue(workspace.shipping.dimensions.height);
              setDimensionUnit((workspace.shipping.dimensions.unit as 'CM' | 'MM' | 'IN') || 'CM');
            }

            if (workspace.options.length > 0) {
              variants.setVariantMode('variants');
              variants.setOptionAxes(
                workspace.options.map((axis) => ({
                  id: axis.id,
                  name: axis.name,
                  isVisual: axis.isVisual,
                  values: axis.values.map((v) => ({
                    id: v.id,
                    label: v.label,
                    isPrimary: v.isPrimary,
                    colorId: v.color?.id ?? null,
                    colorHex: v.color?.hexValue ?? null,
                    sizeDefinitionId: v.sizeDefinitionId ?? null,
                  })),
                })),
              );

              variants.setMatrixRows(
                workspace.variants.map((v) => {
                  const selections = v.optionValueIds.map((optValId) => {
                    for (const axis of workspace.options) {
                      const matchedVal = axis.values.find((val) => val.id === optValId);
                      if (matchedVal) {
                        return {
                          axisName: axis.name,
                          valueDisplay: matchedVal.label,
                          valueRef: matchedVal.id,
                        };
                      }
                    }
                    return { axisName: '', valueDisplay: optValId, valueRef: optValId };
                  });

                  return {
                    id: v.id,
                    enabled: v.status === 'ACTIVE',
                    title: v.title || selections.map((s) => s.valueDisplay).join(' / '),
                    optionSelections: selections,
                    sku: v.sku,
                    barcode: v.barcode || '',
                    priceAmount: v.currentPrice?.amount || '',
                    compareAtAmount: v.currentPrice?.compareAtAmount || '',
                    costAmount: v.estimatedCostAmount || '',
                    estimatedCostAmount: v.estimatedCostAmount || '',
                    latestAcquisitionCost: v.latestAcquisitionCost,
                    initialStock: [],
                    primaryColorId: v.primaryColor?.id || null,
                    weightValue: v.shipping?.weight?.value || '400',
                    weightUnit: (v.shipping?.weight?.unit as 'G' | 'KG') || 'G',
                    lengthValue: v.shipping?.dimensions?.length || '30',
                    widthValue: v.shipping?.dimensions?.width || '25',
                    heightValue: v.shipping?.dimensions?.height || '4',
                    dimensionUnit: (v.shipping?.dimensions?.unit as 'CM' | 'MM' | 'IN') || 'CM',
                  };
                }),
              );
            } else {
              variants.setVariantMode('simple');
              const firstV = workspace.variants[0];
              if (firstV) {
                variants.setSku(firstV.sku);
                variants.setBarcode(firstV.barcode || '');
                setPriceAmount(firstV.currentPrice?.amount || '');
                setCompareAtAmount(firstV.currentPrice?.compareAtAmount || '');
                setCostAmount(firstV.estimatedCostAmount || '');
                setEstimatedCostAmount(firstV.estimatedCostAmount || '');
                if (firstV.shipping?.weight || firstV.weight) {
                  const w = firstV.shipping?.weight || firstV.weight;
                  if (w) {
                    setWeightValue(w.value);
                    setWeightUnit((w.unit as 'G' | 'KG') || 'G');
                  }
                }
                if (firstV.shipping?.dimensions || firstV.dimensions) {
                  const d = firstV.shipping?.dimensions || firstV.dimensions;
                  if (d) {
                    setLengthValue(d.length);
                    setWidthValue(d.width);
                    setHeightValue(d.height);
                    setDimensionUnit((d.unit as 'CM' | 'MM' | 'IN') || 'CM');
                  }
                }
              }
            }

            setSeoTitle(workspace.content.seoTitle || '');
            setSeoDescription(workspace.content.seoDescription || '');
            content.setInformationGroups(
              workspace.content.informationGroups.map((group, groupIndex) => ({
                id: group.id || `group-${groupIndex}`,
                title: group.title,
                items: group.items.map((item, itemIndex) => ({
                  id: item.id || `item-${groupIndex}-${itemIndex}`,
                  label: item.label,
                  value: item.value,
                })),
              })),
            );
            content.setFaqs(
              (workspace.content.faqs || []).map((f, idx) => ({
                id: `${idx}-${f.question}`,
                question: f.question,
                answer: f.answer,
              })),
            );

            setProductVersion(workspace.version);
            setProductStatus(workspace.status);
            setPublicationStatus(workspace.publicationStatus);
            setIsDirty(false);
          }
        },
      )
      .catch((err) => {
        if (controller.signal.aborted) return;
        setGeneralError(
          err instanceof Error
            ? err.message
            : 'Failed to load catalog configurations and taxonomies.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [productId, isEditMode]);

  // --------------------------------------------------------------------------
  // Title & Handle Handlers
  // --------------------------------------------------------------------------
  const handleProductTypeChange = (newTypeId: string) => {
    setProductTypeId(newTypeId);
    const targetType = references.types.find((t) => t.id === newTypeId);
    const targetAttrIds = new Set(targetType?.attributes?.map((a) => a.id) ?? []);
    setAttributeValues((prev) => {
      const retained: Record<string, string | boolean | null> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (targetAttrIds.has(key)) {
          retained[key] = value;
        }
      }
      return retained;
    });
    setIsDirty(true);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setIsDirty(true);
    if (isHandleLocked) {
      setHandle(slugify(val));
    }
    if (!variants.skuEdited) {
      variants.setSku(generateSkuPrefix(val, selectedProductType?.name) + '001');
    }
    if (fieldErrors.title) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.title;
        return next;
      });
    }
  };

  const handleHandleChange = (val: string) => {
    setHandle(slugify(val));
    setIsDirty(true);
    if (fieldErrors.handle) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.handle;
        return next;
      });
    }
  };

  const handleToggleHandleLock = () => {
    setIsHandleLocked((locked) => {
      const next = !locked;
      if (next) setHandle(slugify(title));
      return next;
    });
    setIsDirty(true);
  };

  // --------------------------------------------------------------------------
  // Category Selection
  // --------------------------------------------------------------------------
  const handleToggleCategory = (catId: string) => {
    setIsDirty(true);
    setSelectedCategoryIds((prev) => {
      if (prev.includes(catId)) {
        const next = prev.filter((id) => id !== catId);
        if (primaryCategoryId === catId) {
          setPrimaryCategoryId(next[0] || '');
        }
        return next;
      } else {
        const next = [...prev, catId];
        if (!primaryCategoryId) {
          setPrimaryCategoryId(catId);
        }
        return next;
      }
    });
  };

  const handleSelectPrimaryCategory = (catId: string) => {
    setIsDirty(true);
    setPrimaryCategoryId(catId);
    if (!selectedCategoryIds.includes(catId)) {
      setSelectedCategoryIds((prev) => [...prev, catId]);
    }
  };

  const handleApplyShippingPreset = (preset: ShippingPreset) => {
    setWeightValue(preset.weightValue);
    setWeightUnit(preset.weightUnit);
    setLengthValue(preset.length);
    setWidthValue(preset.width);
    setHeightValue(preset.height);
    setDimensionUnit(preset.dimensionUnit);
    setIsDirty(true);
  };

  // --------------------------------------------------------------------------
  // Atomic Save Handler
  // --------------------------------------------------------------------------
  const handleSubmit = async (
    e?: FormEvent<HTMLFormElement> | undefined,
    targetStatus: 'DRAFT' | 'ACTIVE' = 'DRAFT',
  ) => {
    if (e) e.preventDefault();

    setGeneralError(null);
    setSuccessMessage(null);
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Title is required.';
    }
    if (!handle.trim()) {
      errors.handle = 'Slug/Handle is required.';
    }
    if (!productTypeId) {
      errors.productTypeId = 'Please select a product type.';
    }

    if (variants.variantMode === 'simple') {
      if (!variants.sku.trim()) {
        errors.sku = 'SKU code is required for the default variant.';
      }
      if (Number(priceAmount) < 0) {
        errors.priceAmount = 'Price cannot be negative.';
      }
    } else {
      const activeRows = variants.matrixRows.filter((r) => r.enabled);
      if (activeRows.length === 0) {
        errors.matrix = 'At least one variant must be enabled.';
      }
      for (const row of activeRows) {
        if (!row.sku.trim()) {
          errors.matrix = 'All active variants must have an assigned SKU code.';
          break;
        }
      }
    }

    const contentError = customerContentValidationError(content.informationGroups, content.faqs);
    if (contentError) {
      errors.customerContent = contentError;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setGeneralError(
        errors.matrix ||
          errors.customerContent ||
          'Please complete all required fields highlighted below.',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);

    try {
      // 1. Attributes
      const attributesPayload = Object.entries(attributeValues)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => ({
          attributeDefinitionId: k,
          value: v,
        }));

      // 2. Options
      const optionsPayload =
        variants.variantMode === 'variants'
          ? variants.optionAxes
              .filter((a) => a.values.length > 0)
              .map((axis, axisIdx) => ({
                ...(isEditMode && !axis.id.startsWith('axis-') ? { id: axis.id } : {}),
                clientRef: axis.id,
                name: axis.name.trim(),
                isVisual: axis.isVisual,
                position: axisIdx,
                values: axis.values.map((v, valIdx) => ({
                  ...(isEditMode && !v.id.startsWith('optval-') ? { id: v.id } : {}),
                  clientRef: v.id,
                  displayValue: v.label.trim(),
                  isPrimary: axis.isVisual ? Boolean(v.isPrimary) : false,
                  colorId: v.colorId || null,
                  sizeDefinitionId: v.sizeDefinitionId || null,
                  position: valIdx,
                })),
              }))
          : [];

      // 3. Variants
      let variantsPayload: SaveCatalogProductWorkspaceDto['variants'] = [];
      if (variants.variantMode === 'simple') {
        const initialStockEntries = variants.simpleInitialStock
          .filter((s) => Number(s.quantity) > 0)
          .map((s) => ({ locationId: s.locationId, quantity: Math.floor(Number(s.quantity)) }));

        variantsPayload = [
          {
            ...(isEditMode && workspaceData?.variants[0]?.id
              ? { id: workspaceData.variants[0].id }
              : {}),
            clientRef: 'simple_var',
            sku: variants.sku.trim().toUpperCase(),
            barcode: variants.barcode.trim() || null,
            status: 'ACTIVE',
            priceAmount: priceAmount.trim() || null,
            compareAtAmount: compareAtAmount.trim() || null,
            currency: 'BDT',
            estimatedCostAmount: (estimatedCostAmount || costAmount).trim() || null,
            ...(initialStockEntries.length > 0 ? { initialStock: initialStockEntries } : {}),
            weight: weightValue.trim() ? { value: weightValue.trim(), unit: weightUnit } : null,
            dimensions:
              lengthValue.trim() && widthValue.trim() && heightValue.trim()
                ? {
                    length: lengthValue.trim(),
                    width: widthValue.trim(),
                    height: heightValue.trim(),
                    unit: dimensionUnit,
                  }
                : null,
          },
        ];
      } else {
        variantsPayload = variants.matrixRows.map((r) => {
          const initialStockEntries = r.initialStock
            .filter((s) => Number(s.quantity) > 0)
            .map((s) => ({ locationId: s.locationId, quantity: Math.floor(Number(s.quantity)) }));

          const optionValueRefs = r.optionSelections
            .map((s) => s.valueRef)
            .filter(Boolean) as string[];

          return {
            ...(isEditMode && workspaceData?.variants.some((v) => v.id === r.id)
              ? { id: r.id }
              : {}),
            clientRef: r.id,
            sku: r.sku.trim().toUpperCase(),
            title: r.title.trim() || null,
            barcode: r.barcode.trim() || null,
            status: r.enabled ? 'ACTIVE' : 'ARCHIVED',
            primaryColorId: r.primaryColorId || null,
            priceAmount: r.priceAmount.trim() || null,
            compareAtAmount: r.compareAtAmount.trim() || null,
            currency: 'BDT',
            estimatedCostAmount: (r.estimatedCostAmount || r.costAmount || '').trim() || null,
            ...(initialStockEntries.length > 0 ? { initialStock: initialStockEntries } : {}),
            ...(optionValueRefs.length > 0 ? { optionValueIds: optionValueRefs } : {}),
            optionSelections: r.optionSelections.map((s) => ({
              axisName: s.axisName,
              valueDisplay: s.valueDisplay,
            })),
            weight: r.weightValue.trim()
              ? { value: r.weightValue.trim(), unit: r.weightUnit }
              : null,
            dimensions:
              r.lengthValue.trim() && r.widthValue.trim() && r.heightValue.trim()
                ? {
                    length: r.lengthValue.trim(),
                    width: r.widthValue.trim(),
                    height: r.heightValue.trim(),
                    unit: r.dimensionUnit,
                  }
                : null,
          };
        });
      }

      // 4. Media
      const validMedia = media.mediaItems.filter((m) => m.assetId);
      const mediaPayload = validMedia.map((m, index) => ({
        assetId: m.assetId!,
        role:
          (m.role as 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM') ||
          (m.isPrimary ? 'THUMBNAIL' : 'GALLERY'),
        position: index,
        isPrimary: Boolean(m.isPrimary),
        optionValueRef: m.optionValueRef || m.optionValueId || null,
        variantRef: m.variantRef || m.variantId || null,
        altTextOverride: m.altText || null,
      }));

      // 5. Customer Content & SEO
      const validFaqs = content.faqs.filter((f) => f.question.trim() && f.answer.trim());
      const validInformationGroups = contentGroupsPayload(content.informationGroups);
      const contentPayload = {
        informationGroups: validInformationGroups.map((g) => ({
          title: g.title,
          items: g.items.map((it) => ({ label: it.label, value: it.value })),
        })),
        faqs: validFaqs.map((f) => ({
          question: f.question.trim(),
          answer: f.answer.trim(),
        })),
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
      };

      // 6. Complete Workspace Payload
      const payload: SaveCatalogProductWorkspaceDto = {
        ...(isEditMode && productId ? { version: productVersion } : {}),
        title: title.trim(),
        handle: handle.trim(),
        productTypeId,
        description: description.trim() || null,
        categoryIds: Array.from(new Set(selectedCategoryIds)),
        primaryCategoryId: primaryCategoryId || null,
        tagIds: Array.from(new Set(selectedTagIds)),
        occasionIds: Array.from(new Set(selectedOccasionIds)),
        collectionIds: Array.from(new Set(selectedCollectionIds)),
        sizeSystemId: sizeSystemId || null,
        sizeGuideId: sizeGuideId || null,
        inventoryPolicy: 'DENY',
        shippingProfile: 'STANDARD',
        shipping: {
          weight: weightValue.trim() ? { value: weightValue.trim(), unit: weightUnit } : null,
          dimensions:
            lengthValue.trim() && widthValue.trim() && heightValue.trim()
              ? {
                  length: lengthValue.trim(),
                  width: widthValue.trim(),
                  height: heightValue.trim(),
                  unit: dimensionUnit,
                }
              : null,
        },
        attributes: attributesPayload,
        options: optionsPayload,
        variants: variantsPayload,
        media: mediaPayload,
        content: contentPayload,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        targetStatus: targetStatus === 'ACTIVE' || publishImmediately ? 'ACTIVE' : 'DRAFT',
      };

      let savedId = productId;
      if (isEditMode && productId) {
        const updated = await catalogData<CatalogProductWorkspaceDto>(
          `/admin/catalog/products/${productId}/workspace`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${productVersion}"` },
            body: JSON.stringify(payload),
          },
        );
        savedId = updated.id;
        setProductVersion(updated.version);
      } else {
        const created = await catalogData<CatalogProductWorkspaceDto>(
          '/admin/catalog/products/workspace',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
        savedId = created.id;
      }

      // Cleanup local draft
      draft.clearDraft();

      setIsDirty(false);
      setSuccessMessage(
        isEditMode
          ? 'Product updated successfully! Redirecting…'
          : 'Product created successfully! Redirecting…',
      );

      setTimeout(() => {
        router.push(`/products/${savedId}`);
      }, 500);
    } catch (err: unknown) {
      if (err instanceof CatalogRequestError) {
        setGeneralError(err.message);
      } else {
        setGeneralError(
          err instanceof Error
            ? err.message
            : isEditMode
              ? 'An error occurred while saving the product.'
              : 'An error occurred while creating the product.',
        );
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  return {
    isEditMode,
    productId,
    productVersion,
    productStatus,
    publicationStatus,
    fileInputRef: media.fileInputRef,
    loading,
    saving,
    savingStatusText,
    generalError,
    successMessage,
    references,
    draftTimestamp: draft.draftTimestamp,
    title,
    handle,
    isHandleLocked,
    productTypeId,
    description,
    selectedProductType,
    activeAttributes,
    attributeValues,
    mediaItems: media.mediaItems,
    isDraggingOver: media.isDraggingOver,
    selectedCategoryIds,
    primaryCategoryId,
    selectedTagIds,
    selectedOccasionIds,
    selectedCollectionIds,
    sizeSystemId,
    sizeGuideId,
    priceAmount,
    compareAtAmount,
    costAmount,
    estimatedCostAmount,
    simpleAcquisitionCost:
      variants.variantMode === 'simple'
        ? (workspaceData?.variants[0]?.latestAcquisitionCost ?? null)
        : null,
    setEstimatedCostAmount,
    simpleInitialStock: variants.simpleInitialStock,
    setSimpleInitialStock: variants.setSimpleInitialStock,
    variantMode: variants.variantMode,
    sku: variants.sku,
    barcode: variants.barcode,
    optionAxes: variants.optionAxes,
    matrixRows: variants.matrixRows,
    weightValue,
    weightUnit,
    lengthValue,
    widthValue,
    heightValue,
    dimensionUnit,
    seoTitle,
    seoDescription,
    informationGroups: content.informationGroups,
    faqs: content.faqs,
    showAdvancedContent: content.showAdvancedContent,
    publishImmediately,
    isDirty,
    fieldErrors,
    readinessChecklist,
    setIsHandleLocked,
    setDescription,
    setAttributeValues,
    setIsDraggingOver: media.setIsDraggingOver,
    setSizeSystemId,
    setSizeGuideId,
    setPriceAmount,
    setCompareAtAmount,
    setCostAmount,
    setVariantMode: variants.setVariantMode,
    setSku: variants.setSku,
    setSkuEdited: variants.setSkuEdited,
    setBarcode: variants.setBarcode,
    setWeightValue,
    setWeightUnit,
    setLengthValue,
    setWidthValue,
    setHeightValue,
    setDimensionUnit,
    setSeoTitle,
    setSeoDescription,
    setShowAdvancedContent: content.setShowAdvancedContent,
    setPublishImmediately,
    setSelectedTagIds,
    setSelectedOccasionIds,
    setSelectedCollectionIds,
    setIsDirty,
    handleRestoreDraft: draft.handleRestoreDraft,
    handleDiscardDraft: draft.handleDiscardDraft,
    handleProductTypeChange,
    handleTitleChange,
    handleHandleChange,
    handleToggleHandleLock,
    handleFilesSelected: media.handleFilesSelected,
    handleSetPrimaryMedia: media.handleSetPrimaryMedia,
    handleRemoveMedia: media.handleRemoveMedia,
    handleUpdateMediaAlt: media.handleUpdateMediaAlt,
    handleMoveMedia: media.handleMoveMedia,
    handleUpdateMediaScope: media.handleUpdateMediaScope,
    handleAddExistingAssets: media.handleAddExistingAssets,
    scopeOptions,
    handleToggleCategory,
    handleSelectPrimaryCategory,
    addOptionValue: variants.addOptionValue,
    removeOptionValue: variants.removeOptionValue,
    setPrimaryVisualValue: variants.setPrimaryVisualValue,
    toggleAxisVisual: variants.toggleAxisVisual,
    addOptionAxis: variants.addOptionAxis,
    removeOptionAxis: variants.removeOptionAxis,
    applyPresetStructure: variants.applyPresetStructure,
    importSizesFromSystem: variants.importSizesFromSystem,
    handleApplyPriceToAll: variants.handleApplyPriceToAll,
    handleApplyCostToAll: variants.handleApplyCostToAll,
    handleRegenerateAllSkus: variants.handleRegenerateAllSkus,
    handleToggleAllVariants: variants.handleToggleAllVariants,
    handleUpdateMatrixRow: variants.handleUpdateMatrixRow,
    handleBulkUpdateMatrix: variants.handleBulkUpdateMatrix,
    handleApplyShippingPreset,
    addInformationGroup: content.addInformationGroup,
    updateInformationGroupTitle: content.updateInformationGroupTitle,
    removeInformationGroup: content.removeInformationGroup,
    addInformationItem: content.addInformationItem,
    updateInformationItem: content.updateInformationItem,
    removeInformationItem: content.removeInformationItem,
    addFaq: content.addFaq,
    updateFaq: content.updateFaq,
    removeFaq: content.removeFaq,
    handleSubmit,
  };
}

export type ProductCreatorState = ReturnType<typeof useProductCreatorState>;
