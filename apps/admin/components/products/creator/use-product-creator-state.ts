'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  CatalogCategoryChoiceDto,
  CatalogColorDto,
  CatalogProductContentUpdateDto,
  CatalogProductCreateDto,
  CatalogProductSummaryDto,
  CatalogProductTypeDefinitionDto,
  CatalogProductWorkspaceDto,
  CatalogVocabularyListDto,
  SizeGuideSummaryDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import {
  catalogData,
  catalogRequest,
  CatalogRequestError,
  productMediaUrl,
} from '@/lib/catalog/api';
import { uploadMediaFile, waitForMediaReady } from '@/lib/media/api';

import type {
  FaqEntry,
  InformationGroupEntry,
  OptionAxisState,
  OptionValueState,
  ProductCreatorDraft,
  ProductCreatorReferences,
  ReadinessChecklistItem,
  ShippingPreset,
  SizingReferenceData,
  StagedMediaItem,
  VariantMatrixRow,
  VariantStockEntry,
} from './types';
import type { SelectedMediaAsset } from '@/components/media/asset-picker-dialog';
import type { MediaCardScopeOption } from './media-card';

export const DRAFT_STORAGE_KEY = 'maevelle_product_creator_draft_v2';

export const SHIPPING_PRESETS: readonly ShippingPreset[] = [
  {
    label: 'Light Apparel',
    description: 'T-Shirts, Silk Scarves, Lawn Kurtis (0.4 kg)',
    weightValue: '400',
    weightUnit: 'G',
    length: '30',
    width: '25',
    height: '4',
    dimensionUnit: 'CM',
  },
  {
    label: 'Heavy / Festive Fashion',
    description: 'Festive Panjabis, Sarees, Embroidered Lehengas (1.2 kg)',
    weightValue: '1.2',
    weightUnit: 'KG',
    length: '40',
    width: '30',
    height: '8',
    dimensionUnit: 'CM',
  },
  {
    label: 'Footwear & Boxed Goods',
    description: 'Mojaris, Leather Loafers, Nagras in Box (0.8 kg)',
    weightValue: '800',
    weightUnit: 'G',
    length: '32',
    width: '20',
    height: '12',
    dimensionUnit: 'CM',
  },
  {
    label: 'Jewelry & Accessories',
    description: 'Brooches, Buttons, Cufflinks in Compact Box (0.15 kg)',
    weightValue: '150',
    weightUnit: 'G',
    length: '15',
    width: '10',
    height: '3',
    dimensionUnit: 'CM',
  },
];

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateSkuPrefix(title: string, typeName?: string): string {
  const words = (title || typeName || 'PRD').split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]?.toUpperCase()).join('');
  const clean = title.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (initials.length >= 3 ? initials : clean.slice(0, 4) || 'PRD') + '-';
}

export function generateVariantSku(
  prefix: string,
  selections: readonly { axisName: string; valueDisplay: string }[],
): string {
  const parts = selections.map((s) =>
    s.valueDisplay
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4),
  );
  return `${prefix}${parts.join('-')}`;
}

function contentGroupsPayload(groups: readonly InformationGroupEntry[]) {
  return groups
    .map((group) => ({
      title: group.title.trim(),
      items: group.items
        .filter((item) => item.label.trim() && item.value.trim())
        .map((item) => ({ label: item.label.trim(), value: item.value.trim() })),
    }))
    .filter((group) => group.title && group.items.length > 0);
}

function customerContentValidationError(
  groups: readonly InformationGroupEntry[],
  faqs: readonly FaqEntry[],
): string | null {
  const meaningfulGroups = groups.filter(
    (group) =>
      group.title.trim() || group.items.some((item) => item.label.trim() || item.value.trim()),
  );
  const groupTitles = meaningfulGroups.map((group) => group.title.trim().toLocaleLowerCase('en'));
  if (groupTitles.some((title) => !title))
    return 'Name every specification group that contains information.';
  if (new Set(groupTitles).size !== groupTitles.length)
    return 'Each specification group needs a unique name.';

  for (const group of meaningfulGroups) {
    const meaningfulItems = group.items.filter((item) => item.label.trim() || item.value.trim());
    if (meaningfulItems.length === 0)
      return `Add at least one key and value to “${group.title.trim()}”, or remove the empty group.`;
    if (meaningfulItems.some((item) => !item.label.trim() || !item.value.trim()))
      return `Complete both the key and value for every row in “${group.title.trim()}”.`;
    const labels = meaningfulItems.map((item) => item.label.trim().toLocaleLowerCase('en'));
    if (new Set(labels).size !== labels.length)
      return `Use each key only once in “${group.title.trim()}”.`;
  }

  if (faqs.some((faq) => Boolean(faq.question.trim()) !== Boolean(faq.answer.trim())))
    return 'Complete both the question and answer for every FAQ, or remove the incomplete FAQ.';
  return null;
}

export function useProductCreatorState({
  productId,
}: {
  productId?: string | undefined;
} = {}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = Boolean(productId && productId !== 'new');
  const [productVersion, setProductVersion] = useState<number>(1);
  const [productStatus, setProductStatus] = useState<string>('DRAFT');
  const [publicationStatus, setPublicationStatus] = useState<'UNPUBLISHED' | 'PUBLISHED'>(
    'UNPUBLISHED',
  );
  const [workspaceData, setWorkspaceData] = useState<CatalogProductWorkspaceDto | null>(null);
  const [, setRemovedMediaPlacementIds] = useState<string[]>([]);

  // Loading & Reference State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStatusText, setSavingStatusText] = useState(
    isEditMode ? 'Saving product…' : 'Creating product…',
  );
  const [generalError, setGeneralError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  // Draft Autosave state
  const [draftTimestamp, setDraftTimestamp] = useState<number | null>(null);

  // Core Form Fields
  const [title, setTitle] = useState('');
  const [handle, setHandle] = useState('');
  const [isHandleLocked, setIsHandleLocked] = useState(true);
  const [productTypeId, setProductTypeId] = useState('');
  const [description, setDescription] = useState('');

  // Media / Gallery Uploads
  const [mediaItems, setMediaItems] = useState<StagedMediaItem[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Merchandising & Organization
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [primaryCategoryId, setPrimaryCategoryId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedOccasionIds, setSelectedOccasionIds] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  // Sizing
  const [sizeSystemId, setSizeSystemId] = useState('');
  const [sizeGuideId, setSizeGuideId] = useState('');

  // Dynamic Attributes
  const [attributeValues, setAttributeValues] = useState<Record<string, string | boolean | null>>(
    {},
  );

  // Pricing & Costing
  const [priceAmount, setPriceAmount] = useState('');
  const [compareAtAmount, setCompareAtAmount] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [estimatedCostAmount, setEstimatedCostAmount] = useState('');

  // Variant Mode: Single SKU vs Multi-Variant
  const [variantMode, setVariantMode] = useState<'simple' | 'variants'>('simple');
  const [sku, setSku] = useState('');
  const [skuEdited, setSkuEdited] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [simpleInitialStock, setSimpleInitialStock] = useState<VariantStockEntry[]>([]);

  // Multi-Variant Axes & Dynamic Matrix
  const [optionAxes, setOptionAxes] = useState<OptionAxisState[]>([
    { id: 'opt-color', name: 'Color', isVisual: true, values: [] },
    { id: 'opt-size', name: 'Size', isVisual: false, values: [] },
  ]);
  const [matrixRows, setMatrixRows] = useState<VariantMatrixRow[]>([]);

  // Shipping & Physical Specifications
  const [weightValue, setWeightValue] = useState('400');
  const [weightUnit, setWeightUnit] = useState<'G' | 'KG'>('G');
  const [lengthValue, setLengthValue] = useState('30');
  const [widthValue, setWidthValue] = useState('25');
  const [heightValue, setHeightValue] = useState('4');
  const [dimensionUnit, setDimensionUnit] = useState<'CM' | 'MM' | 'IN'>('CM');

  // SEO & Content
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [informationGroups, setInformationGroups] = useState<InformationGroupEntry[]>([]);
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [showAdvancedContent, setShowAdvancedContent] = useState(false);

  // Publishing Intent
  const [publishImmediately, setPublishImmediately] = useState(false);

  // Dirty state tracking & errors
  const [isDirty, setIsDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
            // Populate form fields from existing workspace
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

            setMediaItems(
              (workspace.media || []).map((m) => ({
                id: m.id,
                assetId: m.assetId,
                previewUrl: productMediaUrl(m.assetId, 'PUBLIC'),
                isPrimary: m.isPrimary,
                role: m.role,
                variantId: m.variantId,
                optionValueId: m.optionValueId,
                position: m.position,
                altText: m.title || m.altText || '',
                isUploading: false,
              })),
            );

            // Product-level shipping defaults
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

            // Reconstruct variant selections
            const valToSelection = new Map<
              string,
              { axisName: string; valueDisplay: string; valueRef: string }
            >();
            for (const opt of workspace.options || []) {
              for (const val of opt.values || []) {
                valToSelection.set(val.id, {
                  axisName: opt.name,
                  valueDisplay: val.label,
                  valueRef: val.id,
                });
              }
            }

            if (workspace.options && workspace.options.length > 0) {
              setVariantMode('variants');
              setOptionAxes(
                workspace.options.map((opt) => ({
                  id: opt.id,
                  name: opt.name,
                  isVisual: opt.isVisual,
                  values: opt.values.map((v) => ({
                    id: v.id,
                    label: v.label,
                    isPrimary: v.isPrimary,
                    colorId: v.color?.id ?? null,
                    colorHex: v.color?.hexValue ?? null,
                    sizeDefinitionId: v.sizeDefinitionId ?? null,
                  })),
                })),
              );
              setMatrixRows(
                workspace.variants.map((v) => ({
                  id: v.id,
                  enabled: v.status === 'ACTIVE',
                  title: v.title || v.sku,
                  optionSelections: (v.optionValueIds || [])
                    .map((valId) => valToSelection.get(valId))
                    .filter(
                      (sel): sel is { axisName: string; valueDisplay: string; valueRef: string } =>
                        Boolean(sel),
                    ),
                  sku: v.sku,
                  barcode: v.barcode || '',
                  priceAmount: v.currentPrice?.amount || '',
                  compareAtAmount: v.currentPrice?.compareAtAmount || '',
                  costAmount: v.estimatedCostAmount || '',
                  estimatedCostAmount: v.estimatedCostAmount || '',
                  initialStock: [],
                  primaryColorId: v.primaryColor?.id || null,
                  weightValue: v.shipping?.weight?.value || v.weight?.value || '400',
                  weightUnit:
                    (v.shipping?.weight?.unit as 'G' | 'KG') ||
                    (v.weight?.unit as 'G' | 'KG') ||
                    'G',
                  lengthValue: v.shipping?.dimensions?.length || v.dimensions?.length || '30',
                  widthValue: v.shipping?.dimensions?.width || v.dimensions?.width || '25',
                  heightValue: v.shipping?.dimensions?.height || v.dimensions?.height || '4',
                  dimensionUnit:
                    (v.shipping?.dimensions?.unit as 'CM' | 'MM' | 'IN') ||
                    (v.dimensions?.unit as 'CM' | 'MM' | 'IN') ||
                    'CM',
                })),
              );
            } else {
              setVariantMode('simple');
              const firstV = workspace.variants[0];
              if (firstV) {
                setSku(firstV.sku);
                setBarcode(firstV.barcode || '');
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
            setInformationGroups(
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
            setFaqs(
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
          } else {
            // New products intentionally begin unclassified and uncategorized.
            // Check for local draft in create mode
            try {
              const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
              if (rawDraft) {
                const parsed = JSON.parse(rawDraft) as ProductCreatorDraft;
                if (parsed && parsed.timestamp && (parsed.title || parsed.description)) {
                  setDraftTimestamp(parsed.timestamp);
                }
              }
            } catch {
              // Ignore localStorage errors
            }
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
  // Draft Autosave to localStorage (Debounced 1.5s)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (isEditMode || !isDirty || loading) return;

    const timer = setTimeout(() => {
      const draft: ProductCreatorDraft = {
        timestamp: Date.now(),
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
        variantMode,
        priceAmount,
        compareAtAmount,
        costAmount,
        estimatedCostAmount: estimatedCostAmount || costAmount,
        initialStock: simpleInitialStock,
        sku,
        barcode,
        optionAxes,
        matrixRows,
        weightValue,
        weightUnit,
        lengthValue,
        widthValue,
        heightValue,
        dimensionUnit,
        seoTitle,
        seoDescription,
        informationGroups,
        faqs,
      };

      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // quota exceeded or storage disabled
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    isDirty,
    loading,
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
    variantMode,
    priceAmount,
    compareAtAmount,
    costAmount,
    estimatedCostAmount,
    simpleInitialStock,
    sku,
    barcode,
    optionAxes,
    matrixRows,
    weightValue,
    weightUnit,
    lengthValue,
    widthValue,
    heightValue,
    dimensionUnit,
    seoTitle,
    seoDescription,
    informationGroups,
    faqs,
  ]);

  const handleRestoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as ProductCreatorDraft;
      if (!d) return;

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
      setVariantMode(d.variantMode || 'simple');
      setPriceAmount(d.priceAmount || '');
      setCompareAtAmount(d.compareAtAmount || '');
      setCostAmount(d.costAmount || '');
      setEstimatedCostAmount(d.estimatedCostAmount || d.costAmount || '');
      setSimpleInitialStock((d.initialStock as VariantStockEntry[]) || []);
      setSku(d.sku || '');
      setBarcode(d.barcode || '');
      if (d.optionAxes && d.optionAxes.length > 0) setOptionAxes(d.optionAxes as OptionAxisState[]);
      if (d.matrixRows && d.matrixRows.length > 0)
        setMatrixRows(d.matrixRows as VariantMatrixRow[]);
      setWeightValue(d.weightValue || '400');
      setWeightUnit(d.weightUnit || 'G');
      setLengthValue(d.lengthValue || '30');
      setWidthValue(d.widthValue || '25');
      setHeightValue(d.heightValue || '4');
      setDimensionUnit(d.dimensionUnit || 'CM');
      setSeoTitle(d.seoTitle || '');
      setSeoDescription(d.seoDescription || '');
      setInformationGroups(
        d.informationGroups
          ? d.informationGroups.map((group) => ({ ...group, items: [...group.items] }))
          : d.highlights?.length
            ? [{ id: `legacy-${Date.now()}`, title: 'Product Details', items: [...d.highlights] }]
            : [],
      );
      setFaqs([...(d.faqs || [])]);

      setDraftTimestamp(null);
      setIsDirty(true);
    } catch {
      setGeneralError('Failed to parse cached draft.');
    }
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraftTimestamp(null);
  };

  // --------------------------------------------------------------------------
  // Selected Product Type & Active Attributes
  // --------------------------------------------------------------------------
  const selectedProductType = useMemo(
    () => references.types.find((t) => t.id === productTypeId),
    [references.types, productTypeId],
  );

  const activeAttributes = useMemo(
    () => selectedProductType?.attributes?.filter((a) => a.status === 'ACTIVE') ?? [],
    [selectedProductType],
  );

  const handleProductTypeChange = (newTypeId: string) => {
    setProductTypeId(newTypeId);
    setAttributeValues({});
    setIsDirty(true);
  };

  // --------------------------------------------------------------------------
  // Handle & Title Synchronization
  // --------------------------------------------------------------------------
  const handleTitleChange = (val: string) => {
    setTitle(val);
    setIsDirty(true);
    if (isHandleLocked) {
      setHandle(slugify(val));
    }
    if (!skuEdited) {
      setSku(generateSkuPrefix(val, selectedProductType?.name) + '001');
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
  // Media Uploads
  // --------------------------------------------------------------------------
  const handleFilesSelected = async (
    files: FileList | null,
    targetScope?: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      optionValueRef?: string | null;
      optionValueId?: string | null;
      variantRef?: string | null;
      variantId?: string | null;
    },
  ) => {
    if (!files || files.length === 0) return;
    setIsDirty(true);

    const acceptedFiles = Array.from(files).filter((file) => {
      const supported = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      return supported && file.size > 0 && file.size <= 10 * 1024 * 1024;
    });
    if (acceptedFiles.length === 0) {
      setGeneralError('Choose a JPEG, PNG, or WebP image smaller than 10 MB.');
      return;
    }
    if (acceptedFiles.length !== files.length) {
      setGeneralError(
        'Some files were skipped because they were not JPEG, PNG, or WebP images under 10 MB.',
      );
    }

    const visualAxis = optionAxes.find((a) => a.isVisual && a.values.length > 0);
    const primaryVisualVal = visualAxis?.values.find((v) => v.isPrimary) || visualAxis?.values[0];

    const resolvedRole = targetScope?.role || (visualAxis ? 'COLOR_GALLERY' : 'GALLERY');
    const resolvedOptionValueRef =
      targetScope?.optionValueRef !== undefined
        ? targetScope.optionValueRef
        : visualAxis
          ? primaryVisualVal?.id || null
          : null;
    const resolvedOptionValueId =
      targetScope?.optionValueId !== undefined
        ? targetScope.optionValueId
        : isEditMode && primaryVisualVal && !primaryVisualVal.id.startsWith('optval-')
          ? primaryVisualVal.id
          : null;
    const resolvedVariantRef = targetScope?.variantRef ?? null;
    const resolvedVariantId = targetScope?.variantId ?? null;

    const newItems: StagedMediaItem[] = acceptedFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isPrimary: mediaItems.length === 0 && idx === 0,
      role: resolvedRole,
      optionValueRef: resolvedOptionValueRef,
      optionValueId: resolvedOptionValueId,
      variantRef: resolvedVariantRef,
      variantId: resolvedVariantId,
      altText: title || file.name.replace(/\.[^/.]+$/, ''),
      isUploading: true,
      uploadProgress: 0,
      processingStage: 'UPLOADING',
    }));

    setMediaItems((prev) => [...prev, ...newItems]);

    // Upload independently so one slow image does not block every remaining file.
    await Promise.all(
      newItems.map(async (item) => {
        if (!item.file) return;

        try {
          const uploaded = await uploadMediaFile(item.file, {
            visibility: 'PUBLIC',
            title: item.file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
            altText: item.altText || title || 'Product Image',
            onProgress: (uploadProgress) =>
              setMediaItems((current) =>
                current.map((media) =>
                  media.id === item.id ? { ...media, uploadProgress } : media,
                ),
              ),
          });
          const assetId = uploaded.assetId;
          setMediaItems((current) =>
            current.map((media) =>
              media.id === item.id ? { ...media, assetId, processingStage: 'PROCESSING' } : media,
            ),
          );
          const status = await waitForMediaReady(assetId, { timeoutMs: 90_000 });
          if (status !== 'READY')
            throw new Error(
              status === 'FAILED' || status === 'QUARANTINED'
                ? 'Media processing rejected this image.'
                : 'Image is still processing. Open the Media library to retry or check status.',
            );

          setMediaItems((prev) =>
            prev.map((m) =>
              m.id === item.id ? { ...m, assetId, isUploading: false, uploadProgress: 100 } : m,
            ),
          );
        } catch (err) {
          setMediaItems((prev) =>
            prev.map((m) =>
              m.id === item.id
                ? {
                    ...m,
                    isUploading: false,
                    error: err instanceof Error ? err.message : 'Upload failed',
                  }
                : m,
            ),
          );
        }
      }),
    );
  };

  const handleSetPrimaryMedia = (id: string) => {
    setMediaItems((prev) =>
      prev.map((m) => ({
        ...m,
        isPrimary: m.id === id,
      })),
    );
    setIsDirty(true);
  };

  const handleRemoveMedia = (id: string) => {
    if (isEditMode && workspaceData?.media.some((m) => m.id === id)) {
      setRemovedMediaPlacementIds((prev) => [...prev, id]);
    }
    setMediaItems((prev) => {
      const filtered = prev.filter((m) => m.id !== id);
      if (filtered.length > 0 && !filtered.some((m) => m.isPrimary)) {
        const first = filtered[0];
        if (first) first.isPrimary = true;
      }
      return filtered;
    });
    setIsDirty(true);
  };

  const handleUpdateMediaAlt = (id: string, altText: string) => {
    setMediaItems((prev) => prev.map((m) => (m.id === id ? { ...m, altText } : m)));
    setIsDirty(true);
  };

  const handleMoveMedia = (id: string, direction: 'left' | 'right') => {
    setMediaItems((prev) => {
      const index = prev.findIndex((m) => m.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      if (item) next.splice(targetIndex, 0, item);
      return next;
    });
    setIsDirty(true);
  };

  const handleUpdateMediaScope = (
    id: string,
    scope: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      variantId?: string | null;
      optionValueId?: string | null;
      variantRef?: string | null;
      optionValueRef?: string | null;
    },
  ) => {
    setMediaItems((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              ...(scope.role !== undefined ? { role: scope.role } : {}),
              ...(scope.variantId !== undefined ? { variantId: scope.variantId } : {}),
              ...(scope.optionValueId !== undefined ? { optionValueId: scope.optionValueId } : {}),
              ...(scope.variantRef !== undefined ? { variantRef: scope.variantRef } : {}),
              ...(scope.optionValueRef !== undefined
                ? { optionValueRef: scope.optionValueRef }
                : {}),
            }
          : m,
      ),
    );
    setIsDirty(true);
  };

  const handleAddExistingAssets = (
    assets: readonly SelectedMediaAsset[],
    targetScope?: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      optionValueRef?: string | null;
      optionValueId?: string | null;
      variantRef?: string | null;
      variantId?: string | null;
    },
  ) => {
    if (assets.length === 0) return;
    const visualAxis = optionAxes.find((a) => a.isVisual && a.values.length > 0);
    const primaryVisualVal = visualAxis?.values.find((v) => v.isPrimary) || visualAxis?.values[0];

    const resolvedRole = targetScope?.role || (visualAxis ? 'COLOR_GALLERY' : 'GALLERY');
    const resolvedOptionValueRef =
      targetScope?.optionValueRef !== undefined
        ? targetScope.optionValueRef
        : visualAxis
          ? primaryVisualVal?.id || null
          : null;
    const resolvedOptionValueId =
      targetScope?.optionValueId !== undefined
        ? targetScope.optionValueId
        : isEditMode && primaryVisualVal && !primaryVisualVal.id.startsWith('optval-')
          ? primaryVisualVal.id
          : null;

    const newItems: StagedMediaItem[] = assets.map((asset, idx) => ({
      id: `${Date.now()}-${idx}-${asset.id.slice(0, 8)}`,
      assetId: asset.id,
      previewUrl: asset.previewUrl,
      isPrimary: mediaItems.length === 0 && idx === 0,
      role: resolvedRole,
      optionValueRef: resolvedOptionValueRef,
      optionValueId: resolvedOptionValueId,
      variantRef: targetScope?.variantRef ?? null,
      variantId: targetScope?.variantId ?? null,
      altText: asset.altText || asset.filename.replace(/\.[^.]+$/, ''),
      isUploading: false,
    }));
    setMediaItems((prev) => [...prev, ...newItems]);
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

  // --------------------------------------------------------------------------
  // Option Axes & Matrix Generation
  // --------------------------------------------------------------------------
  const activeAxes = useMemo(() => optionAxes.filter((a) => a.values.length > 0), [optionAxes]);

  const scopeOptions = useMemo<MediaCardScopeOption[]>(() => {
    const options: MediaCardScopeOption[] = [];
    const visualAxis = activeAxes.find((a) => a.isVisual);
    if (visualAxis) {
      for (const val of visualAxis.values) {
        options.push({
          id: `color-${val.id}`,
          label: `${visualAxis.name}: ${val.label}${val.isPrimary ? ' (Cover)' : ''}`,
          type: 'COLOR',
          optionValueRef: val.id,
          optionValueId: isEditMode && !val.id.startsWith('optval-') ? val.id : undefined,
          isPrimary: Boolean(val.isPrimary),
        });
      }
    } else {
      options.push({
        id: 'general-product',
        label: 'Shared Product Gallery (Uniform Photography)',
        type: 'GENERAL',
      });
    }
    if (variantMode === 'variants') {
      for (const row of matrixRows) {
        if (row.enabled && row.sku) {
          options.push({
            id: `variant-${row.id}`,
            label: `Variant: ${row.sku} (${row.optionSelections.map((s) => s.valueDisplay).join(' / ') || row.title})`,
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
  }, [activeAxes, matrixRows, variantMode, workspaceData, isEditMode]);

  const regenerateMatrix = useCallback(() => {
    const validAxes = optionAxes.filter((a) => a.values.length > 0);
    if (validAxes.length === 0) {
      setMatrixRows([]);
      return;
    }

    const combinations: { axisName: string; valueDisplay: string; valueRef: string }[][] = [];

    function generateCombos(
      current: { axisName: string; valueDisplay: string; valueRef: string }[],
      axisIndex: number,
    ) {
      if (axisIndex === validAxes.length) {
        combinations.push(current);
        return;
      }

      const axis = validAxes[axisIndex];
      if (!axis) return;
      for (const val of axis.values) {
        generateCombos(
          [...current, { axisName: axis.name, valueDisplay: val.label, valueRef: val.id }],
          axisIndex + 1,
        );
      }
    }

    generateCombos([], 0);

    const prefix = generateSkuPrefix(title, selectedProductType?.name);

    setMatrixRows((existingRows) => {
      return combinations.map((selections) => {
        const signature = selections.map((s) => `${s.axisName}:${s.valueDisplay}`).join('|');
        const existing = existingRows.find(
          (r) =>
            r.optionSelections.map((s) => `${s.axisName}:${s.valueDisplay}`).join('|') ===
            signature,
        );

        if (existing) {
          return {
            ...existing,
            optionSelections: selections,
          };
        }

        const rowTitle = selections.map((s) => s.valueDisplay).join(' / ');
        const rowSku = generateVariantSku(prefix, selections);

        const colorSelection = selections.find((s) => s.axisName.toLowerCase() === 'color');
        const matchedColor = colorSelection
          ? references.colors.find(
              (c) => c.name.toLowerCase() === colorSelection.valueDisplay.toLowerCase(),
            )
          : null;

        return {
          id: signature,
          enabled: true,
          title: rowTitle,
          optionSelections: selections,
          sku: rowSku,
          barcode: '',
          priceAmount: priceAmount || '',
          compareAtAmount: compareAtAmount || '',
          costAmount: costAmount || '',
          estimatedCostAmount: estimatedCostAmount || costAmount || '',
          initialStock: [],
          primaryColorId: matchedColor ? matchedColor.id : null,
          weightValue: weightValue || '400',
          weightUnit: weightUnit || 'G',
          lengthValue: lengthValue || '30',
          widthValue: widthValue || '25',
          heightValue: heightValue || '4',
          dimensionUnit: dimensionUnit || 'CM',
        };
      });
    });
  }, [
    optionAxes,
    title,
    selectedProductType?.name,
    references.colors,
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
  ]);

  useEffect(() => {
    if (variantMode === 'variants') {
      regenerateMatrix();
    }
  }, [optionAxes, variantMode, regenerateMatrix]);

  const addOptionValue = (
    axisName: string,
    valInput:
      | string
      | {
          label: string;
          colorId?: string | null;
          colorHex?: string | null;
          sizeDefinitionId?: string | null;
        },
  ) => {
    const label = typeof valInput === 'string' ? valInput.trim() : valInput.label.trim();
    if (!label) return;
    setOptionAxes((prev) =>
      prev.map((axis) => {
        if (axis.name.toLowerCase() === axisName.toLowerCase()) {
          if (axis.values.some((v) => v.label.toLowerCase() === label.toLowerCase())) {
            return axis;
          }
          const isFirstOnVisual = axis.isVisual && axis.values.length === 0;
          const valObj: OptionValueState = {
            id: `optval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            label,
            isPrimary: isFirstOnVisual,
            colorId: typeof valInput === 'object' ? (valInput.colorId ?? null) : null,
            colorHex: typeof valInput === 'object' ? (valInput.colorHex ?? null) : null,
            sizeDefinitionId:
              typeof valInput === 'object' ? (valInput.sizeDefinitionId ?? null) : null,
          };
          return { ...axis, values: [...axis.values, valObj] };
        }
        return axis;
      }),
    );
    setIsDirty(true);
  };

  const removeOptionValue = (axisName: string, valueIdOrLabel: string) => {
    setOptionAxes((prev) =>
      prev.map((axis) => {
        if (axis.name.toLowerCase() === axisName.toLowerCase()) {
          const filtered = axis.values.filter(
            (v) => v.id !== valueIdOrLabel && v.label !== valueIdOrLabel,
          );
          if (axis.isVisual && filtered.length > 0 && !filtered.some((v) => v.isPrimary)) {
            filtered[0] = { ...filtered[0]!, isPrimary: true };
          }
          return { ...axis, values: filtered };
        }
        return axis;
      }),
    );
    setIsDirty(true);
  };

  const setPrimaryVisualValue = (axisName: string, valueId: string) => {
    setOptionAxes((prev) =>
      prev.map((axis) => {
        if (axis.name.toLowerCase() === axisName.toLowerCase()) {
          return {
            ...axis,
            values: axis.values.map((v) => ({
              ...v,
              isPrimary: v.id === valueId,
            })),
          };
        }
        return axis;
      }),
    );
    setIsDirty(true);
  };

  const toggleAxisVisual = (axisName: string) => {
    setOptionAxes((prev) => {
      const targetAxis = prev.find((a) => a.name.toLowerCase() === axisName.toLowerCase());
      const willBeVisual = !targetAxis?.isVisual;
      return prev.map((axis) => {
        if (axis.name.toLowerCase() === axisName.toLowerCase()) {
          const values = willBeVisual
            ? axis.values.map((v, idx) => ({ ...v, isPrimary: idx === 0 }))
            : axis.values.map((v) => ({ ...v, isPrimary: false }));
          return { ...axis, isVisual: willBeVisual, values };
        }
        return willBeVisual
          ? {
              ...axis,
              isVisual: false,
              values: axis.values.map((v) => ({ ...v, isPrimary: false })),
            }
          : axis;
      });
    });
    setIsDirty(true);
  };

  const addOptionAxis = (name: string, isVisual = false) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (optionAxes.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) return;
    const hasVisual = optionAxes.some((a) => a.isVisual);
    const allowVisual = isVisual && !hasVisual;
    setOptionAxes((prev) => [
      ...prev,
      {
        id: `axis-${slugify(trimmed)}-${Date.now()}`,
        name: trimmed,
        isVisual: allowVisual,
        values: [],
      },
    ]);
    setIsDirty(true);
  };

  const removeOptionAxis = (axisIdOrName: string) => {
    setOptionAxes((prev) =>
      prev.filter(
        (a) => a.id !== axisIdOrName && a.name.toLowerCase() !== axisIdOrName.toLowerCase(),
      ),
    );
    setIsDirty(true);
  };

  const applyPresetStructure = (
    preset: 'COLOR_AND_SIZE' | 'SIZE_ONLY' | 'SIMPLE' | 'color-size' | 'size-only' | 'single',
  ) => {
    if (preset === 'SIMPLE' || preset === 'single') {
      setVariantMode('simple');
      setOptionAxes([]);
    } else if (preset === 'COLOR_AND_SIZE' || preset === 'color-size') {
      setVariantMode('variants');
      setOptionAxes([
        { id: 'opt-color', name: 'Color', isVisual: true, values: [] },
        { id: 'opt-size', name: 'Size', isVisual: false, values: [] },
      ]);
    } else if (preset === 'SIZE_ONLY' || preset === 'size-only') {
      setVariantMode('variants');
      setOptionAxes([{ id: 'opt-size', name: 'Size', isVisual: false, values: [] }]);
    }
    setIsDirty(true);
  };

  const importSizesFromSystem = (systemId: string) => {
    const system = references.sizingData.systems.find((s) => s.id === systemId);
    if (!system) return;

    const sizeDefs = references.sizingData.sizeDefinitions
      .filter((sd) => sd.sizeSystemId === systemId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (sizeDefs.length === 0) return;

    setOptionAxes((prev) =>
      prev.map((axis) => {
        if (axis.name.toLowerCase() === 'size') {
          const existingLabels = new Set(axis.values.map((v) => v.label.toLowerCase()));
          const newValues: OptionValueState[] = [
            ...axis.values,
            ...sizeDefs
              .filter((sd) => !existingLabels.has(sd.code.toLowerCase()))
              .map((sd) => ({
                id: `optval-size-${sd.id}`,
                label: sd.code,
                isPrimary: false,
                sizeDefinitionId: sd.id,
              })),
          ];
          return { ...axis, values: newValues };
        }
        return axis;
      }),
    );
    setIsDirty(true);
  };

  // --------------------------------------------------------------------------
  // Matrix Bulk Actions
  // --------------------------------------------------------------------------
  const handleApplyPriceToAll = (amount: string) => {
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        priceAmount: amount,
      })),
    );
    setIsDirty(true);
  };

  const handleApplyCostToAll = (amount: string) => {
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        costAmount: amount,
      })),
    );
    setIsDirty(true);
  };

  const handleRegenerateAllSkus = () => {
    const prefix = generateSkuPrefix(title, selectedProductType?.name);
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        sku: generateVariantSku(prefix, r.optionSelections),
      })),
    );
    setIsDirty(true);
  };

  const handleToggleAllVariants = (enabled: boolean) => {
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        enabled,
      })),
    );
    setIsDirty(true);
  };

  const handleUpdateMatrixRow = (id: string, updates: Partial<VariantMatrixRow>) => {
    setMatrixRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    setIsDirty(true);
  };

  const handleBulkUpdateMatrix = (updates: Partial<VariantMatrixRow>, onlyEnabled = true) => {
    setMatrixRows((prev) =>
      prev.map((r) => (!onlyEnabled || r.enabled ? { ...r, ...updates } : r)),
    );
    setIsDirty(true);
  };

  // --------------------------------------------------------------------------
  // Shipping & Logistics Presets
  // --------------------------------------------------------------------------
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
  // Grouped customer information & FAQs
  // --------------------------------------------------------------------------
  const markCustomerContentChanged = () => {
    setIsDirty(true);
    setFieldErrors((previous) => {
      if (!previous.content) return previous;
      const next = { ...previous };
      delete next.content;
      return next;
    });
  };

  const addInformationGroup = (title = '') => {
    setInformationGroups((previous) => {
      const normalizedTitle = title.trim().toLocaleLowerCase('en');
      const existingGroup = normalizedTitle
        ? previous.find((group) => group.title.trim().toLocaleLowerCase('en') === normalizedTitle)
        : undefined;
      const item = {
        id: `item-${Date.now()}-${Math.random()}`,
        label: '',
        value: '',
      };

      if (existingGroup) {
        return previous.map((group) =>
          group.id === existingGroup.id ? { ...group, items: [...group.items, item] } : group,
        );
      }

      return [...previous, { id: `group-${Date.now()}-${Math.random()}`, title, items: [item] }];
    });
    markCustomerContentChanged();
  };

  const updateInformationGroupTitle = (groupId: string, title: string) => {
    setInformationGroups((previous) =>
      previous.map((group) => (group.id === groupId ? { ...group, title } : group)),
    );
    markCustomerContentChanged();
  };

  const removeInformationGroup = (groupId: string) => {
    setInformationGroups((previous) => previous.filter((group) => group.id !== groupId));
    markCustomerContentChanged();
  };

  const addInformationItem = (groupId: string) => {
    setInformationGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: [
                ...group.items,
                { id: `item-${Date.now()}-${Math.random()}`, label: '', value: '' },
              ],
            }
          : group,
      ),
    );
    markCustomerContentChanged();
  };

  const updateInformationItem = (
    groupId: string,
    itemId: string,
    field: 'label' | 'value',
    value: string,
  ) => {
    setInformationGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map((item) =>
                item.id === itemId ? { ...item, [field]: value } : item,
              ),
            }
          : group,
      ),
    );
    markCustomerContentChanged();
  };

  const removeInformationItem = (groupId: string, itemId: string) => {
    setInformationGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? { ...group, items: group.items.filter((item) => item.id !== itemId) }
          : group,
      ),
    );
    markCustomerContentChanged();
  };

  const addFaq = () => {
    setFaqs((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, question: '', answer: '' },
    ]);
    markCustomerContentChanged();
  };

  const updateFaq = (id: string, field: 'question' | 'answer', val: string) => {
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: val } : f)));
    markCustomerContentChanged();
  };

  const removeFaq = (id: string) => {
    setFaqs((prev) => prev.filter((f) => f.id !== id));
    markCustomerContentChanged();
  };

  // --------------------------------------------------------------------------
  // Publication Readiness Checklist
  // --------------------------------------------------------------------------
  const readinessChecklist = useMemo(() => {
    const hasTitle = Boolean(title.trim().length >= 3);
    const hasType = Boolean(productTypeId);
    const hasCategory = Boolean(primaryCategoryId || selectedCategoryIds.length > 0);
    const hasPricing =
      variantMode === 'simple'
        ? Boolean(Number(priceAmount) > 0)
        : matrixRows.some((r) => r.enabled && Boolean(Number(r.priceAmount) > 0)) ||
          Boolean(Number(priceAmount) > 0);
    const hasSkuOrVariants =
      variantMode === 'simple'
        ? Boolean(sku.trim())
        : matrixRows.some((r) => r.enabled && Boolean(r.sku.trim()));
    const hasMedia = mediaItems.length > 0;

    const items: ReadinessChecklistItem[] = [
      { id: 'title', label: 'Product Name defined', isComplete: hasTitle },
      { id: 'type', label: 'Product Type assigned', isComplete: hasType },
      { id: 'category', label: 'Primary Category assigned', isComplete: hasCategory },
      { id: 'pricing', label: 'Base Selling Price configured', isComplete: hasPricing },
      {
        id: 'variants',
        label:
          variantMode === 'simple' ? 'SKU code assigned' : 'At least 1 variant active with SKU',
        isComplete: hasSkuOrVariants,
      },
      { id: 'media', label: 'At least 1 product image uploaded', isComplete: hasMedia },
    ];

    const completedCount = items.filter((i) => i.isComplete).length;
    const progressPercent = Math.round((completedCount / items.length) * 100);

    return {
      items,
      completedCount,
      totalCount: items.length,
      progressPercent,
      isReadyToPublish: completedCount === items.length,
    };
  }, [
    title,
    productTypeId,
    primaryCategoryId,
    selectedCategoryIds,
    priceAmount,
    variantMode,
    sku,
    matrixRows,
    mediaItems,
  ]);

  // --------------------------------------------------------------------------
  // Form Submission
  // --------------------------------------------------------------------------
  const handleSubmit = async (e?: FormEvent, targetStatus: 'DRAFT' | 'ACTIVE' = 'DRAFT') => {
    if (e) e.preventDefault();
    setGeneralError('');
    setSuccessMessage('');

    // Client validation
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = 'Product name is required.';
    if (!handle.trim()) {
      errors.handle = 'Storefront handle is required.';
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle.trim())) {
      errors.handle = 'Handle must contain only lowercase letters, numbers, and hyphens.';
    }
    if (!productTypeId) errors.productTypeId = 'Please select a product type.';

    activeAttributes.forEach((attr) => {
      if (attr.required) {
        const val = attributeValues[attr.id];
        if (val === undefined || val === null || val === '') {
          errors[`attr_${attr.id}`] = `${attr.name} is required.`;
        }
      }
    });

    const contentError = customerContentValidationError(informationGroups, faqs);
    if (contentError) errors.content = contentError;

    if (variantMode === 'simple') {
      if (!sku.trim()) errors.sku = 'SKU is required for a single SKU product.';
    } else {
      const enabledVariants = matrixRows.filter((r) => r.enabled);
      if (enabledVariants.length === 0) {
        errors.variants = 'Please enable at least one variant in the matrix.';
      } else {
        const skus = enabledVariants.map((v) => v.sku.trim().toUpperCase());
        if (skus.some((s) => !s)) {
          errors.variants = 'Every enabled variant must have a valid SKU.';
        } else if (new Set(skus).size !== skus.length) {
          errors.variants = 'Variant SKUs must be unique within this product.';
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setGeneralError('Please fix the highlighted errors before saving.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (isEditMode && productId) {
      setSaving(true);
      setSavingStatusText('Saving product changes…');

      try {
        let currentVersion = productVersion;

        // 1. Update Product Overview (Title, Handle, Description, ProductTypeId)
        const overviewChanged =
          !workspaceData ||
          title.trim() !== workspaceData.title ||
          handle.trim() !== workspaceData.handle ||
          (description.trim() || null) !== (workspaceData.description || null) ||
          productTypeId !== workspaceData.productTypeId;

        if (overviewChanged) {
          setSavingStatusText('Updating product overview…');
          const overviewRes = await catalogData<CatalogProductSummaryDto>(
            `/admin/catalog/products/${productId}`,
            {
              method: 'PATCH',
              headers: { 'if-match': `"${currentVersion}"` },
              body: JSON.stringify({
                title: title.trim(),
                handle: handle.trim(),
                productTypeId,
                description: description.trim() || null,
              }),
            },
          );
          currentVersion = overviewRes.version;
          setProductVersion(currentVersion);
        }

        // 2. Update Categories
        const categoriesChanged =
          !workspaceData ||
          JSON.stringify([...selectedCategoryIds].sort()) !==
            JSON.stringify([...(workspaceData.organization.categoryIds || [])].sort()) ||
          (primaryCategoryId || null) !== (workspaceData.organization.primaryCategoryId || null);

        if (categoriesChanged) {
          setSavingStatusText('Updating categories…');
          const catRes = await catalogData<CatalogProductSummaryDto>(
            `/admin/catalog/products/${productId}/categories`,
            {
              method: 'PUT',
              headers: { 'if-match': `"${currentVersion}"` },
              body: JSON.stringify({
                categoryIds: Array.from(new Set(selectedCategoryIds)),
                primaryCategoryId: primaryCategoryId || null,
              }),
            },
          );
          currentVersion = catRes.version;
          setProductVersion(currentVersion);
        }

        // 3. Update Dynamic Attributes
        const attrChanged =
          !workspaceData ||
          activeAttributes.some((attr) => {
            const oldVal =
              workspaceData.organization.attributes.find((a) => a.id === attr.id)?.value ?? null;
            const newVal = attributeValues[attr.id] ?? null;
            return oldVal !== newVal;
          });

        if (attrChanged) {
          setSavingStatusText('Updating product attributes…');
          const attrRes = await catalogData<CatalogProductSummaryDto>(
            `/admin/catalog/products/${productId}/attributes`,
            {
              method: 'PUT',
              headers: { 'if-match': `"${currentVersion}"` },
              body: JSON.stringify({
                values: activeAttributes.map((attr) => ({
                  attributeDefinitionId: attr.id,
                  value: attributeValues[attr.id] ?? null,
                })),
              }),
            },
          );
          currentVersion = attrRes.version;
          setProductVersion(currentVersion);
        }

        // 4. Update Vocabulary (Tags, Occasions, Collections)
        const vocabChanged =
          !workspaceData ||
          JSON.stringify([...selectedTagIds].sort()) !==
            JSON.stringify([...(workspaceData.organization.tagIds || [])].sort()) ||
          JSON.stringify([...selectedOccasionIds].sort()) !==
            JSON.stringify([...(workspaceData.organization.occasionIds || [])].sort()) ||
          JSON.stringify([...selectedCollectionIds].sort()) !==
            JSON.stringify([...(workspaceData.organization.collectionIds || [])].sort());

        if (vocabChanged) {
          setSavingStatusText('Updating marketing tags & collections…');
          await catalogData(`/admin/catalog/products/${productId}/vocabulary`, {
            method: 'PUT',
            body: JSON.stringify({
              version: currentVersion,
              tagIds: Array.from(new Set(selectedTagIds)),
              occasionIds: Array.from(new Set(selectedOccasionIds)),
              collectionIds: Array.from(new Set(selectedCollectionIds)),
            }),
          });
        }

        // 5. Update Sizing Configuration
        const sizingChanged =
          !workspaceData ||
          (sizeSystemId || null) !== (workspaceData.sizeSystemId || null) ||
          (sizeGuideId || null) !== (workspaceData.sizeGuideId || null);

        if (sizingChanged) {
          setSavingStatusText('Updating size configuration…');
          if (sizeSystemId) {
            await catalogRequest(`/admin/catalog/products/${productId}/size-configuration`, {
              method: 'PUT',
              body: JSON.stringify({
                sizeSystemId,
                ...(sizeGuideId ? { sizeGuideId } : {}),
              }),
            });
          } else if (workspaceData?.sizeSystemId) {
            await catalogRequest(`/admin/catalog/products/${productId}/size-configuration`, {
              method: 'DELETE',
            }).catch(() => null);
          }
        }

        // 6. Media Placements Batch Synchronization
        const validMedia = mediaItems.filter((m) => m.assetId);
        setSavingStatusText('Synchronizing product media placements & gallery…');
        const placements = validMedia.map((m, index) => ({
          assetId: m.assetId!,
          role: m.role || (m.isPrimary ? 'THUMBNAIL' : 'GALLERY'),
          position: index,
          variantId: m.variantId || null,
          optionValueId: m.optionValueId || null,
          isPrimary: Boolean(m.isPrimary),
          altTextOverride: m.altText || null,
        }));
        await catalogData(`/admin/catalog/products/${productId}/media`, {
          method: 'PUT',
          body: JSON.stringify({ placements }),
        });
        setRemovedMediaPlacementIds([]);

        // 7. Update Customer Content & SEO
        const validFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim());
        const validInformationGroups = contentGroupsPayload(informationGroups);
        setSavingStatusText('Saving customer content & search metadata…');
        const contentPayload: CatalogProductContentUpdateDto = {
          informationGroups: validInformationGroups,
          faqs: validFaqs.map((f) => ({
            question: f.question.trim(),
            answer: f.answer.trim(),
          })),
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        };
        const contentResult = await catalogData<CatalogProductSummaryDto>(
          `/admin/catalog/products/${productId}/content`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${currentVersion}"` },
            body: JSON.stringify(contentPayload),
          },
        );
        currentVersion = contentResult.version;
        setProductVersion(currentVersion);

        // 8. Update Variants and Pricing
        if (variantMode === 'simple') {
          const firstVariant = workspaceData?.variants[0];
          if (firstVariant) {
            setSavingStatusText('Updating SKU and pricing…');
            const coreChanged =
              sku.trim().toUpperCase() !== firstVariant.sku ||
              (barcode.trim() || null) !== (firstVariant.barcode || null) ||
              (weightValue.trim() || null) !== (firstVariant.weight?.value || null) ||
              weightUnit !== (firstVariant.weight?.unit || 'G') ||
              (lengthValue.trim() || null) !== (firstVariant.dimensions?.length || null) ||
              (widthValue.trim() || null) !== (firstVariant.dimensions?.width || null) ||
              (heightValue.trim() || null) !== (firstVariant.dimensions?.height || null) ||
              dimensionUnit !== (firstVariant.dimensions?.unit || 'CM');

            if (coreChanged) {
              await catalogData(
                `/admin/catalog/products/${productId}/variants/${firstVariant.id}`,
                {
                  method: 'PATCH',
                  body: JSON.stringify({
                    version: firstVariant.version,
                    sku: sku.trim().toUpperCase(),
                    barcode: barcode.trim() || null,
                    status: 'ACTIVE',
                    weight: weightValue.trim()
                      ? { value: weightValue.trim(), unit: weightUnit }
                      : null,
                    dimensions:
                      lengthValue.trim() && widthValue.trim() && heightValue.trim()
                        ? {
                            length: lengthValue.trim(),
                            width: widthValue.trim(),
                            height: heightValue.trim(),
                            unit: dimensionUnit,
                          }
                        : null,
                  }),
                },
              );
            }

            const priceChanged =
              (priceAmount.trim() || null) !== (firstVariant.currentPrice?.amount || null) ||
              (compareAtAmount.trim() || null) !==
                (firstVariant.currentPrice?.compareAtAmount || null);

            if (priceChanged && priceAmount.trim()) {
              await catalogData(`/admin/pricing/variants/${firstVariant.id}/current`, {
                method: 'PUT',
                body: JSON.stringify({
                  currency: 'BDT',
                  amount: priceAmount.trim(),
                  compareAtAmount: compareAtAmount.trim() || null,
                }),
              });
            }
          }
        } else {
          setSavingStatusText('Updating variant matrix…');
          for (const row of matrixRows) {
            const existingVariant = workspaceData?.variants.find((v) => v.id === row.id);
            if (existingVariant) {
              const coreChanged =
                row.sku.trim().toUpperCase() !== existingVariant.sku ||
                row.title.trim() !== (existingVariant.title || '') ||
                (row.barcode.trim() || null) !== (existingVariant.barcode || null) ||
                (row.enabled ? 'ACTIVE' : 'ARCHIVED') !== existingVariant.status ||
                (row.primaryColorId || null) !== (existingVariant.primaryColor?.id || null) ||
                (row.weightValue.trim() || null) !== (existingVariant.weight?.value || null) ||
                row.weightUnit !== (existingVariant.weight?.unit || 'G') ||
                (row.lengthValue.trim() || null) !== (existingVariant.dimensions?.length || null) ||
                (row.widthValue.trim() || null) !== (existingVariant.dimensions?.width || null) ||
                (row.heightValue.trim() || null) !== (existingVariant.dimensions?.height || null) ||
                row.dimensionUnit !== (existingVariant.dimensions?.unit || 'CM');

              if (coreChanged) {
                await catalogData(
                  `/admin/catalog/products/${productId}/variants/${existingVariant.id}`,
                  {
                    method: 'PATCH',
                    body: JSON.stringify({
                      version: existingVariant.version,
                      sku: row.sku.trim().toUpperCase(),
                      title: row.title.trim() || null,
                      barcode: row.barcode.trim() || null,
                      status: row.enabled ? 'ACTIVE' : 'ARCHIVED',
                      primaryColorId: row.primaryColorId || null,
                      weight: row.weightValue.trim()
                        ? { value: row.weightValue.trim(), unit: row.weightUnit }
                        : null,
                      dimensions:
                        row.lengthValue.trim() && row.widthValue.trim() && row.heightValue.trim()
                          ? {
                              length: row.lengthValue.trim(),
                              width: row.widthValue.trim(),
                              height: row.heightValue.trim(),
                              unit: row.dimensionUnit,
                            }
                          : null,
                    }),
                  },
                );
              }

              const priceChanged =
                (row.priceAmount.trim() || null) !==
                  (existingVariant.currentPrice?.amount || null) ||
                (row.compareAtAmount.trim() || null) !==
                  (existingVariant.currentPrice?.compareAtAmount || null);

              if (priceChanged && row.priceAmount.trim()) {
                await catalogData(`/admin/pricing/variants/${existingVariant.id}/current`, {
                  method: 'PUT',
                  body: JSON.stringify({
                    currency: 'BDT',
                    amount: row.priceAmount.trim(),
                    compareAtAmount: row.compareAtAmount.trim() || null,
                  }),
                });
              }
            }
          }
        }

        // 9. Publishing if requested
        if (targetStatus === 'ACTIVE' && publicationStatus !== 'PUBLISHED') {
          setSavingStatusText('Publishing product to storefront…');
          await catalogData(`/admin/catalog/products/${productId}/publish`, {
            method: 'POST',
            body: JSON.stringify({ version: currentVersion }),
          });
        }

        setIsDirty(false);
        setSuccessMessage('Product updated successfully! Redirecting…');
        setTimeout(() => {
          router.push(`/products/${productId}`);
        }, 600);
      } catch (err: unknown) {
        if (err instanceof CatalogRequestError) {
          setGeneralError(err.message);
        } else {
          setGeneralError(
            err instanceof Error ? err.message : 'An error occurred while saving the product.',
          );
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    setSavingStatusText('Creating product & configuring variants…');

    try {
      // 1. Attributes payload
      const attributesPayload = Object.entries(attributeValues)
        .filter(([, val]) => val !== '' && val !== null && val !== undefined)
        .map(([attributeDefinitionId, value]) => ({
          attributeDefinitionId,
          value,
        }));

      // 2. Options and Variants payload
      const optionsPayload =
        variantMode === 'variants' && activeAxes.length > 0
          ? activeAxes.map((axis, idx) => ({
              clientRef: axis.id,
              name: axis.name,
              code: slugify(axis.name),
              position: idx,
              isVisual: axis.isVisual,
              values: axis.values.map((v, vIdx) => {
                const matchedColor =
                  v.colorId ||
                  (axis.name.toLowerCase() === 'color'
                    ? references.colors.find((c) => c.name.toLowerCase() === v.label.toLowerCase())
                        ?.id
                    : null);
                const matchedSize =
                  v.sizeDefinitionId ||
                  (axis.name.toLowerCase() === 'size'
                    ? references.sizingData.sizeDefinitions.find(
                        (s) =>
                          s.code.toLowerCase() === v.label.toLowerCase() &&
                          s.sizeSystemId === sizeSystemId,
                      )?.id
                    : null);

                return {
                  clientRef: v.id,
                  displayValue: v.label,
                  code: slugify(v.label),
                  position: vIdx,
                  isPrimary: Boolean(v.isPrimary),
                  ...(matchedColor ? { colorId: matchedColor } : {}),
                  ...(matchedSize ? { sizeDefinitionId: matchedSize } : {}),
                };
              }),
            }))
          : undefined;

      const enabledVariants = variantMode === 'variants' ? matrixRows.filter((r) => r.enabled) : [];

      const variantsPayload =
        enabledVariants.length > 0
          ? enabledVariants.map((v) => ({
              clientRef: v.id,
              sku: v.sku.trim().toUpperCase(),
              title: v.title.trim() || null,
              barcode: v.barcode.trim() || null,
              priceAmount: v.priceAmount.trim() || null,
              compareAtAmount: v.compareAtAmount.trim() || null,
              currency: 'BDT',
              estimatedCostAmount: (v.estimatedCostAmount || v.costAmount || '').trim() || null,
              initialStock: (v.initialStock || [])
                .filter((s) => Number(s.quantity) > 0)
                .map((s) => ({
                  locationId: s.locationId,
                  quantity: Math.round(Number(s.quantity)),
                })),
              optionValueRefs: v.optionSelections
                .map((sel) => sel.valueRef)
                .filter((ref): ref is string => Boolean(ref)),
              optionSelections: v.optionSelections.map((s) => ({
                axisName: s.axisName,
                valueDisplay: s.valueDisplay,
              })),
              weight: v.weightValue.trim()
                ? {
                    value: v.weightValue.trim(),
                    unit: v.weightUnit,
                  }
                : null,
              dimensions:
                v.lengthValue.trim() && v.widthValue.trim() && v.heightValue.trim()
                  ? {
                      length: v.lengthValue.trim(),
                      width: v.widthValue.trim(),
                      height: v.heightValue.trim(),
                      unit: v.dimensionUnit,
                    }
                  : null,
              primaryColorId: v.primaryColorId || null,
            }))
          : undefined;

      const validMedia = mediaItems.filter((m) => m.assetId);

      // 3. Main Product Create DTO
      const payload: CatalogProductCreateDto = {
        title: title.trim(),
        handle: handle.trim(),
        productTypeId,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(selectedCategoryIds.length > 0 ? { categoryIds: selectedCategoryIds } : {}),
        ...(primaryCategoryId ? { primaryCategoryId } : {}),
        ...(selectedTagIds.length > 0 ? { tagIds: selectedTagIds } : {}),
        ...(selectedOccasionIds.length > 0 ? { occasionIds: selectedOccasionIds } : {}),
        ...(selectedCollectionIds.length > 0 ? { collectionIds: selectedCollectionIds } : {}),
        ...(sizeSystemId ? { sizeSystemId } : {}),
        ...(sizeGuideId ? { sizeGuideId } : {}),
        ...(attributesPayload.length > 0 ? { attributes: attributesPayload } : {}),
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
        ...(variantMode === 'simple' && sku.trim()
          ? {
              initialVariant: {
                sku: sku.trim().toUpperCase(),
                barcode: barcode.trim() || null,
                compareAtAmount: compareAtAmount.trim() || null,
                currency: 'BDT',
                estimatedCostAmount: (estimatedCostAmount || costAmount || '').trim() || null,
                initialStock: simpleInitialStock
                  .filter((s) => Number(s.quantity) > 0)
                  .map((s) => ({
                    locationId: s.locationId,
                    quantity: Math.round(Number(s.quantity)),
                  })),
                ...(priceAmount.trim() ? { priceAmount: priceAmount.trim() } : {}),
              },
            }
          : {}),
        ...(optionsPayload ? { options: optionsPayload } : {}),
        ...(variantsPayload ? { variants: variantsPayload } : {}),
        ...(validMedia.length > 0
          ? {
              media: validMedia.map((m) => ({
                assetId: m.assetId!,
                role: m.role || (m.isPrimary ? 'THUMBNAIL' : 'GALLERY'),
                isPrimary: Boolean(m.isPrimary),
                optionValueRef: m.optionValueRef || m.optionValueId || null,
                variantRef: m.variantRef || m.variantId || null,
                altTextOverride: m.altText || null,
              })),
            }
          : {}),
        ...(seoTitle.trim() ? { seoTitle: seoTitle.trim() } : {}),
        ...(seoDescription.trim() ? { seoDescription: seoDescription.trim() } : {}),
      };

      const created = await catalogData<CatalogProductSummaryDto>('/admin/catalog/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      let createdVersion = created.version;

      // 5. Save Customer Content (FAQs and Highlights)
      const validFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim());
      const validInformationGroups = contentGroupsPayload(informationGroups);

      if (
        validFaqs.length > 0 ||
        validInformationGroups.length > 0 ||
        seoTitle.trim() ||
        seoDescription.trim()
      ) {
        setSavingStatusText('Saving customer content & search metadata…');
        const contentPayload: CatalogProductContentUpdateDto = {
          informationGroups: validInformationGroups,
          faqs: validFaqs.map((f) => ({
            question: f.question.trim(),
            answer: f.answer.trim(),
          })),
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        };
        const contentResult = await catalogData<CatalogProductSummaryDto>(
          `/admin/catalog/products/${created.id}/content`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${createdVersion}"` },
            body: JSON.stringify(contentPayload),
          },
        );
        createdVersion = contentResult.version;
      }

      // 6. If targetStatus is ACTIVE, publish the product
      if (targetStatus === 'ACTIVE' || publishImmediately) {
        setSavingStatusText('Publishing product to storefront…');
        await catalogData(`/admin/catalog/products/${created.id}/publish`, {
          method: 'POST',
          body: JSON.stringify({ version: createdVersion }),
        });
      }

      // 7. Cleanup draft and navigate directly to product detail page!
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setIsDirty(false);
      setSuccessMessage('Product created successfully! Redirecting…');

      setTimeout(() => {
        router.push(`/products/${created.id}`);
      }, 600);
    } catch (err: unknown) {
      if (err instanceof CatalogRequestError) {
        setGeneralError(err.message);
      } else {
        setGeneralError(
          err instanceof Error ? err.message : 'An error occurred while creating the product.',
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
    fileInputRef,
    loading,
    saving,
    savingStatusText,
    generalError,
    successMessage,
    references,
    draftTimestamp,
    title,
    handle,
    isHandleLocked,
    productTypeId,
    description,
    selectedProductType,
    activeAttributes,
    attributeValues,
    mediaItems,
    isDraggingOver,
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
    setEstimatedCostAmount,
    simpleInitialStock,
    setSimpleInitialStock,
    variantMode,
    sku,
    barcode,
    optionAxes,
    matrixRows,
    weightValue,
    weightUnit,
    lengthValue,
    widthValue,
    heightValue,
    dimensionUnit,
    seoTitle,
    seoDescription,
    informationGroups,
    faqs,
    showAdvancedContent,
    publishImmediately,
    isDirty,
    fieldErrors,
    readinessChecklist,
    setIsHandleLocked,
    setDescription,
    setAttributeValues,
    setIsDraggingOver,
    setSizeSystemId,
    setSizeGuideId,
    setPriceAmount,
    setCompareAtAmount,
    setCostAmount,
    setVariantMode,
    setSku,
    setSkuEdited,
    setBarcode,
    setWeightValue,
    setWeightUnit,
    setLengthValue,
    setWidthValue,
    setHeightValue,
    setDimensionUnit,
    setSeoTitle,
    setSeoDescription,
    setShowAdvancedContent,
    setPublishImmediately,
    setSelectedTagIds,
    setSelectedOccasionIds,
    setSelectedCollectionIds,
    setIsDirty,
    handleRestoreDraft,
    handleDiscardDraft,
    handleProductTypeChange,
    handleTitleChange,
    handleHandleChange,
    handleToggleHandleLock,
    handleFilesSelected,
    handleSetPrimaryMedia,
    handleRemoveMedia,
    handleUpdateMediaAlt,
    handleMoveMedia,
    handleUpdateMediaScope,
    handleAddExistingAssets,
    scopeOptions,
    handleToggleCategory,
    handleSelectPrimaryCategory,
    addOptionValue,
    removeOptionValue,
    setPrimaryVisualValue,
    toggleAxisVisual,
    addOptionAxis,
    removeOptionAxis,
    applyPresetStructure,
    importSizesFromSystem,
    handleApplyPriceToAll,
    handleApplyCostToAll,
    handleRegenerateAllSkus,
    handleToggleAllVariants,
    handleUpdateMatrixRow,
    handleBulkUpdateMatrix,
    handleApplyShippingPreset,
    addInformationGroup,
    updateInformationGroupTitle,
    removeInformationGroup,
    addInformationItem,
    updateInformationItem,
    removeInformationItem,
    addFaq,
    updateFaq,
    removeFaq,
    handleSubmit,
  };
}

export type ProductCreatorState = ReturnType<typeof useProductCreatorState>;
