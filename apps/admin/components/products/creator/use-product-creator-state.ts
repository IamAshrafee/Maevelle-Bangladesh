'use client';

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import type {
  CatalogCategoryChoiceDto,
  CatalogColorDto,
  CatalogProductContentUpdateDto,
  CatalogProductCreateDto,
  CatalogProductSummaryDto,
  CatalogProductTypeDefinitionDto,
  CatalogProductWorkspaceDto,
  CatalogVocabularyItemDto,
  CatalogVocabularyListDto,
  SizeGuideSummaryDto,
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
  InfoHighlightEntry,
  OptionAxisState,
  ProductCreatorDraft,
  ProductCreatorReferences,
  ReadinessChecklistItem,
  ShippingPreset,
  SizingReferenceData,
  StagedMediaItem,
  VariantMatrixRow,
} from './types';

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
  const [removedMediaPlacementIds, setRemovedMediaPlacementIds] = useState<string[]>([]);

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
  const [attributeValues, setAttributeValues] = useState<Record<string, string | boolean>>({});

  // Pricing & Costing
  const [priceAmount, setPriceAmount] = useState('');
  const [compareAtAmount, setCompareAtAmount] = useState('');
  const [costAmount, setCostAmount] = useState('');

  // Variant Mode: Single SKU vs Multi-Variant
  const [variantMode, setVariantMode] = useState<'simple' | 'variants'>('simple');
  const [sku, setSku] = useState('');
  const [skuEdited, setSkuEdited] = useState(false);
  const [barcode, setBarcode] = useState('');

  // Multi-Variant Axes & Dynamic Matrix
  const [optionAxes, setOptionAxes] = useState<OptionAxisState[]>([
    { name: 'Color', values: [] },
    { name: 'Size', values: [] },
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
  const [highlights, setHighlights] = useState<InfoHighlightEntry[]>([]);
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

            const attrs: Record<string, string | boolean> = {};
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
                altText: m.title || '',
                isUploading: false,
              })),
            );

            // Reconstruct variant selections
            const valToSelection = new Map<string, { axisName: string; valueDisplay: string }>();
            for (const opt of workspace.options || []) {
              for (const val of opt.values || []) {
                valToSelection.set(val.id, { axisName: opt.name, valueDisplay: val.label });
              }
            }

            if (workspace.options && workspace.options.length > 0) {
              setVariantMode('variants');
              setOptionAxes(
                workspace.options.map((opt) => ({
                  name: opt.name,
                  values: opt.values.map((v) => v.label),
                })),
              );
              setMatrixRows(
                workspace.variants.map((v) => ({
                  id: v.id,
                  enabled: v.status === 'ACTIVE',
                  title: v.title || v.sku,
                  optionSelections: (v.optionValueIds || [])
                    .map((valId) => valToSelection.get(valId))
                    .filter((sel): sel is { axisName: string; valueDisplay: string } =>
                      Boolean(sel),
                    ),
                  sku: v.sku,
                  barcode: v.barcode || '',
                  priceAmount: v.currentPrice?.amount || '',
                  compareAtAmount: v.currentPrice?.compareAtAmount || '',
                  costAmount: '',
                  primaryColorId: v.primaryColor?.id || null,
                  weightValue: v.weight?.value || '400',
                  weightUnit: (v.weight?.unit as 'G' | 'KG') || 'G',
                  lengthValue: v.dimensions?.length || '30',
                  widthValue: v.dimensions?.width || '25',
                  heightValue: v.dimensions?.height || '4',
                  dimensionUnit: (v.dimensions?.unit as 'CM' | 'MM' | 'IN') || 'CM',
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
                if (firstV.weight) {
                  setWeightValue(firstV.weight.value);
                  setWeightUnit((firstV.weight.unit as 'G' | 'KG') || 'G');
                }
                if (firstV.dimensions) {
                  setLengthValue(firstV.dimensions.length);
                  setWidthValue(firstV.dimensions.width);
                  setHeightValue(firstV.dimensions.height);
                  setDimensionUnit((firstV.dimensions.unit as 'CM' | 'MM' | 'IN') || 'CM');
                }
              }
            }

            setSeoTitle(workspace.content.seoTitle || '');
            setSeoDescription(workspace.content.seoDescription || '');
            const primaryGroup = workspace.content.informationGroups[0];
            if (primaryGroup) {
              setHighlights(
                primaryGroup.items.map((item, idx) => ({
                  id: `${idx}-${item.label}`,
                  label: item.label,
                  value: item.value,
                })),
              );
            }
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
            // New Product initialization
            if (typesData.length > 0 && !productTypeId) {
              const defaultType = typesData[0];
              if (defaultType) {
                setProductTypeId(defaultType.id);
                if (defaultType.primaryCategoryId) {
                  setSelectedCategoryIds([defaultType.primaryCategoryId]);
                  setPrimaryCategoryId(defaultType.primaryCategoryId);
                }
              }
            }

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
        highlights,
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
    highlights,
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
      setHighlights([...(d.highlights || [])]);
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
    setIsDirty(true);
    const chosenType = references.types.find((t) => t.id === newTypeId);
    if (chosenType?.primaryCategoryId && selectedCategoryIds.length === 0) {
      setSelectedCategoryIds([chosenType.primaryCategoryId]);
      setPrimaryCategoryId(chosenType.primaryCategoryId);
    }
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

  // --------------------------------------------------------------------------
  // Media Uploads
  // --------------------------------------------------------------------------
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsDirty(true);

    const newItems: StagedMediaItem[] = Array.from(files).map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isPrimary: mediaItems.length === 0 && idx === 0,
      altText: title || file.name.replace(/\.[^/.]+$/, ''),
      isUploading: true,
      uploadProgress: 0,
      processingStage: 'UPLOADING',
    }));

    setMediaItems((prev) => [...prev, ...newItems]);

    // Stream files to Media service in background
    for (const item of newItems) {
      if (!item.file) continue;

      try {
        const uploaded = await uploadMediaFile(item.file, {
          visibility: 'PUBLIC',
          title: item.file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
          altText: item.altText || title || 'Product Image',
          onProgress: (uploadProgress) =>
            setMediaItems((current) =>
              current.map((media) => (media.id === item.id ? { ...media, uploadProgress } : media)),
            ),
        });
        const assetId = uploaded.assetId;
        setMediaItems((current) =>
          current.map((media) =>
            media.id === item.id ? { ...media, assetId, processingStage: 'PROCESSING' } : media,
          ),
        );
        const status = await waitForMediaReady(assetId);
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
    }
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

  const regenerateMatrix = useCallback(() => {
    const validAxes = optionAxes.filter((a) => a.values.length > 0);
    if (validAxes.length === 0) {
      setMatrixRows([]);
      return;
    }

    const combinations: { axisName: string; valueDisplay: string }[][] = [];

    function generateCombos(
      current: { axisName: string; valueDisplay: string }[],
      axisIndex: number,
    ) {
      if (axisIndex === validAxes.length) {
        combinations.push(current);
        return;
      }

      const axis = validAxes[axisIndex];
      if (!axis) return;
      for (const val of axis.values) {
        generateCombos([...current, { axisName: axis.name, valueDisplay: val }], axisIndex + 1);
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

        if (existing) return existing;

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

  const addOptionValue = (axisName: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setOptionAxes((prev) =>
      prev.map((axis) => {
        if (axis.name.toLowerCase() === axisName.toLowerCase()) {
          if (axis.values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
            return axis;
          }
          return { ...axis, values: [...axis.values, trimmed] };
        }
        return axis;
      }),
    );
    setIsDirty(true);
  };

  const removeOptionValue = (axisName: string, value: string) => {
    setOptionAxes((prev) =>
      prev.map((axis) => {
        if (axis.name.toLowerCase() === axisName.toLowerCase()) {
          return { ...axis, values: axis.values.filter((v) => v !== value) };
        }
        return axis;
      }),
    );
    setIsDirty(true);
  };

  const importSizesFromSystem = (systemId: string) => {
    const system = references.sizingData.systems.find((s) => s.id === systemId);
    if (!system) return;

    const sizes = references.sizingData.sizeDefinitions
      .filter((sd) => sd.sizeSystemId === systemId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((sd) => sd.code);

    if (sizes.length === 0) return;

    setOptionAxes((prev) =>
      prev.map((axis) => {
        if (axis.name.toLowerCase() === 'size') {
          const merged = [...new Set([...axis.values, ...sizes])];
          return { ...axis, values: merged };
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
  // Highlights & FAQs
  // --------------------------------------------------------------------------
  const addHighlight = () => {
    setHighlights((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, label: '', value: '' },
    ]);
    setIsDirty(true);
  };

  const updateHighlight = (id: string, field: 'label' | 'value', val: string) => {
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: val } : h)));
    setIsDirty(true);
  };

  const removeHighlight = (id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setIsDirty(true);
  };

  const addFaq = () => {
    setFaqs((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, question: '', answer: '' },
    ]);
    setIsDirty(true);
  };

  const updateFaq = (id: string, field: 'question' | 'answer', val: string) => {
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: val } : f)));
    setIsDirty(true);
  };

  const removeFaq = (id: string) => {
    setFaqs((prev) => prev.filter((f) => f.id !== id));
    setIsDirty(true);
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

        // 6. Media Updates (Delete removed, Attach newly staged)
        if (removedMediaPlacementIds.length > 0) {
          setSavingStatusText('Removing deleted gallery images…');
          for (const mId of removedMediaPlacementIds) {
            await catalogData(`/admin/catalog/products/${productId}/media/${mId}`, {
              method: 'DELETE',
            }).catch(() => null);
          }
          setRemovedMediaPlacementIds([]);
        }

        const newMediaToAttach = mediaItems.filter(
          (m) => m.assetId && !workspaceData?.media.some((existing) => existing.id === m.id),
        );
        if (newMediaToAttach.length > 0) {
          setSavingStatusText('Attaching newly uploaded images…');
          const existingCount =
            (workspaceData?.media.length || 0) - removedMediaPlacementIds.length;
          for (const [idx, m] of newMediaToAttach.entries()) {
            await catalogData(`/admin/catalog/products/${productId}/media`, {
              method: 'POST',
              body: JSON.stringify({
                assetId: m.assetId,
                role: m.isPrimary ? 'THUMBNAIL' : 'GALLERY',
                position: Math.max(0, existingCount) + idx,
                isPrimary: m.isPrimary,
              }),
            }).catch(() => null);
          }
        }

        // 7. Update Customer Content & SEO
        const validFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim());
        const validHighlights = highlights.filter((h) => h.label.trim() && h.value.trim());
        setSavingStatusText('Saving customer content & search metadata…');
        const contentPayload: CatalogProductContentUpdateDto = {
          informationGroups:
            validHighlights.length > 0
              ? [
                  {
                    title: 'Product Details',
                    items: validHighlights.map((h) => ({
                      label: h.label.trim(),
                      value: h.value.trim(),
                    })),
                  },
                ]
              : [],
          faqs: validFaqs.map((f) => ({
            question: f.question.trim(),
            answer: f.answer.trim(),
          })),
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        };
        await catalogData(`/admin/catalog/products/${productId}/content`, {
          method: 'PUT',
          headers: { 'if-match': `"${currentVersion}"` },
          body: JSON.stringify(contentPayload),
        }).catch(() => null);

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
          }).catch(() => null);
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
              name: axis.name,
              code: slugify(axis.name),
              position: idx,
              values: axis.values.map((v, vIdx) => {
                const matchedColor =
                  axis.name.toLowerCase() === 'color'
                    ? references.colors.find((c) => c.name.toLowerCase() === v.toLowerCase())
                    : null;
                const matchedSize =
                  axis.name.toLowerCase() === 'size'
                    ? references.sizingData.sizeDefinitions.find(
                        (s) =>
                          s.code.toLowerCase() === v.toLowerCase() &&
                          s.sizeSystemId === sizeSystemId,
                      )
                    : null;

                return {
                  displayValue: v,
                  code: slugify(v),
                  position: vIdx,
                  ...(matchedColor ? { colorId: matchedColor.id } : {}),
                  ...(matchedSize ? { sizeDefinitionId: matchedSize.id } : {}),
                };
              }),
            }))
          : undefined;

      const enabledVariants = variantMode === 'variants' ? matrixRows.filter((r) => r.enabled) : [];

      const variantsPayload =
        enabledVariants.length > 0
          ? enabledVariants.map((v) => ({
              sku: v.sku.trim().toUpperCase(),
              title: v.title.trim() || null,
              barcode: v.barcode.trim() || null,
              priceAmount: v.priceAmount.trim() || null,
              compareAtAmount: v.compareAtAmount.trim() || null,
              currency: 'BDT',
              weight: v.weightValue.trim()
                ? {
                    value: v.weightValue.trim(),
                    unit: v.weightUnit,
                  }
                : weightValue.trim()
                  ? { value: weightValue.trim(), unit: weightUnit }
                  : null,
              dimensions:
                v.lengthValue.trim() && v.widthValue.trim() && v.heightValue.trim()
                  ? {
                      length: v.lengthValue.trim(),
                      width: v.widthValue.trim(),
                      height: v.heightValue.trim(),
                      unit: v.dimensionUnit,
                    }
                  : lengthValue.trim() && widthValue.trim() && heightValue.trim()
                    ? {
                        length: lengthValue.trim(),
                        width: widthValue.trim(),
                        height: heightValue.trim(),
                        unit: dimensionUnit,
                      }
                    : null,
              primaryColorId: v.primaryColorId || null,
              optionSelections: v.optionSelections,
            }))
          : undefined;

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
        ...(variantMode === 'simple' && sku.trim()
          ? {
              initialVariant: {
                sku: sku.trim().toUpperCase(),
                barcode: barcode.trim() || null,
                compareAtAmount: compareAtAmount.trim() || null,
                currency: 'BDT',
                ...(priceAmount.trim() ? { priceAmount: priceAmount.trim() } : {}),
              },
            }
          : {}),
        ...(optionsPayload ? { options: optionsPayload } : {}),
        ...(variantsPayload ? { variants: variantsPayload } : {}),
        ...(seoTitle.trim() ? { seoTitle: seoTitle.trim() } : {}),
        ...(seoDescription.trim() ? { seoDescription: seoDescription.trim() } : {}),
      };

      const created = await catalogData<CatalogProductSummaryDto>('/admin/catalog/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // 4. Attach uploaded media items
      const validMedia = mediaItems.filter((m) => m.assetId);
      if (validMedia.length > 0) {
        setSavingStatusText('Attaching gallery images…');
        for (const [index, media] of validMedia.entries()) {
          try {
            await catalogData(`/admin/catalog/products/${created.id}/media`, {
              method: 'POST',
              body: JSON.stringify({
                assetId: media.assetId,
                role: media.isPrimary ? 'THUMBNAIL' : 'GALLERY',
                position: index,
                isPrimary: media.isPrimary,
              }),
            });
          } catch {
            // non-fatal
          }
        }
      }

      // 5. Save Customer Content (FAQs and Highlights)
      const validFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim());
      const validHighlights = highlights.filter((h) => h.label.trim() && h.value.trim());

      if (
        validFaqs.length > 0 ||
        validHighlights.length > 0 ||
        seoTitle.trim() ||
        seoDescription.trim()
      ) {
        setSavingStatusText('Saving customer content & search metadata…');
        try {
          const contentPayload: CatalogProductContentUpdateDto = {
            informationGroups:
              validHighlights.length > 0
                ? [
                    {
                      title: 'Product Details',
                      items: validHighlights.map((h) => ({
                        label: h.label.trim(),
                        value: h.value.trim(),
                      })),
                    },
                  ]
                : [],
            faqs: validFaqs.map((f) => ({
              question: f.question.trim(),
              answer: f.answer.trim(),
            })),
            seoTitle: seoTitle.trim() || null,
            seoDescription: seoDescription.trim() || null,
          };
          await catalogData(`/admin/catalog/products/${created.id}/content`, {
            method: 'PUT',
            headers: { 'if-match': `"${created.version}"` },
            body: JSON.stringify(contentPayload),
          });
        } catch {
          // non-fatal
        }
      }

      // 6. If targetStatus is ACTIVE, publish the product
      if (targetStatus === 'ACTIVE' || publishImmediately) {
        setSavingStatusText('Publishing product to storefront…');
        try {
          await catalogData(`/admin/catalog/products/${created.id}/publish`, {
            method: 'POST',
            body: JSON.stringify({ version: created.version }),
          });
        } catch {
          // non-fatal
        }
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
    highlights,
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
    handleFilesSelected,
    handleSetPrimaryMedia,
    handleRemoveMedia,
    handleUpdateMediaAlt,
    handleToggleCategory,
    handleSelectPrimaryCategory,
    addOptionValue,
    removeOptionValue,
    importSizesFromSystem,
    handleApplyPriceToAll,
    handleApplyCostToAll,
    handleRegenerateAllSkus,
    handleToggleAllVariants,
    handleUpdateMatrixRow,
    handleBulkUpdateMatrix,
    handleApplyShippingPreset,
    addHighlight,
    updateHighlight,
    removeHighlight,
    addFaq,
    updateFaq,
    removeFaq,
    handleSubmit,
  };
}

export type ProductCreatorState = ReturnType<typeof useProductCreatorState>;
