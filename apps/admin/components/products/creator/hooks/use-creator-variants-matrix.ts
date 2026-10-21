'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CatalogProductTypeDefinitionDto } from '@maevelle/contracts';
import { generateSkuPrefix, generateVariantSku, slugify } from '../utils/sku-generator';
import type {
  OptionAxisState,
  OptionValueState,
  ProductCreatorReferences,
  VariantMatrixRow,
  VariantStockEntry,
} from '../types';

interface UseCreatorVariantsMatrixOptions {
  readonly title: string;
  readonly selectedProductType: CatalogProductTypeDefinitionDto | undefined;
  readonly references: ProductCreatorReferences;
  readonly priceAmount: string;
  readonly compareAtAmount: string;
  readonly costAmount: string;
  readonly estimatedCostAmount: string;
  readonly weightValue: string;
  readonly weightUnit: 'G' | 'KG';
  readonly lengthValue: string;
  readonly widthValue: string;
  readonly heightValue: string;
  readonly dimensionUnit: 'CM' | 'MM' | 'IN';
  readonly onDirty?: () => void;
}

export function useCreatorVariantsMatrix({
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
  onDirty,
}: UseCreatorVariantsMatrixOptions) {
  const [variantMode, setVariantMode] = useState<'simple' | 'variants'>('simple');
  const [sku, setSku] = useState('');
  const [skuEdited, setSkuEdited] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [simpleInitialStock, setSimpleInitialStock] = useState<VariantStockEntry[]>([]);
  const [optionAxes, setOptionAxes] = useState<OptionAxisState[]>([]);
  const [matrixRows, setMatrixRows] = useState<VariantMatrixRow[]>([]);

  const markDirty = () => {
    onDirty?.();
  };

  const activeAxes = useMemo(() => optionAxes.filter((a) => a.values.length > 0), [optionAxes]);

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
    markDirty();
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
    markDirty();
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
    markDirty();
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
    markDirty();
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
    markDirty();
  };

  const removeOptionAxis = (axisIdOrName: string) => {
    setOptionAxes((prev) =>
      prev.filter(
        (a) => a.id !== axisIdOrName && a.name.toLowerCase() !== axisIdOrName.toLowerCase(),
      ),
    );
    markDirty();
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
    markDirty();
  };

  const importSizesFromSystem = (systemId: string) => {
    const system = references.sizingData.systems.find((s) => s.id === systemId);
    if (!system) return;

    const sizeDefs = references.sizingData.sizeDefinitions
      .filter((sd) => sd.sizeSystemId === systemId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (sizeDefs.length === 0) return;

    setOptionAxes((prev) => {
      const hasSizeAxis = prev.some((axis) => axis.name.toLowerCase() === 'size');

      if (!hasSizeAxis) {
        return [
          ...prev,
          {
            id: `opt-size-${Date.now()}`,
            name: 'Size',
            isVisual: false,
            values: sizeDefs.map((sd) => ({
              id: `optval-size-${sd.id}`,
              label: sd.label || sd.code,
              isPrimary: false,
              sizeDefinitionId: sd.id,
            })),
          },
        ];
      }

      return prev.map((axis) => {
        if (axis.name.toLowerCase() === 'size') {
          const existingLabels = new Set(
            axis.values.flatMap((v) => [v.label.toLowerCase(), (v.sizeDefinitionId ?? '').toLowerCase()]),
          );
          const newEntries: OptionValueState[] = sizeDefs
            .filter(
              (sd) =>
                !existingLabels.has((sd.label || '').toLowerCase()) &&
                !existingLabels.has(sd.code.toLowerCase()) &&
                !existingLabels.has(sd.id.toLowerCase()),
            )
            .map((sd) => ({
              id: `optval-size-${sd.id}`,
              label: sd.label || sd.code,
              isPrimary: false,
              sizeDefinitionId: sd.id,
            }));

          // Merge and sort combined values using size definition sort orders
          const combined = [...axis.values, ...newEntries];
          const sortOrderMap = new Map(sizeDefs.map((sd) => [sd.id, sd.sortOrder]));
          combined.sort((a, b) => {
            const orderA = a.sizeDefinitionId ? (sortOrderMap.get(a.sizeDefinitionId) ?? 9999) : 9999;
            const orderB = b.sizeDefinitionId ? (sortOrderMap.get(b.sizeDefinitionId) ?? 9999) : 9999;
            return orderA - orderB;
          });

          return { ...axis, values: combined };
        }
        return axis;
      });
    });
    markDirty();
  };

  const handleApplyPriceToAll = (amount: string) => {
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        priceAmount: amount,
      })),
    );
    markDirty();
  };

  const handleApplyCostToAll = (amount: string) => {
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        costAmount: amount,
      })),
    );
    markDirty();
  };

  const handleRegenerateAllSkus = () => {
    const prefix = generateSkuPrefix(title, selectedProductType?.name);
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        sku: generateVariantSku(prefix, r.optionSelections),
      })),
    );
    markDirty();
  };

  const handleToggleAllVariants = (enabled: boolean) => {
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        enabled,
      })),
    );
    markDirty();
  };

  const handleUpdateMatrixRow = (id: string, updates: Partial<VariantMatrixRow>) => {
    setMatrixRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    markDirty();
  };

  const handleBulkUpdateMatrix = (updates: Partial<VariantMatrixRow>, onlyEnabled = true) => {
    setMatrixRows((prev) =>
      prev.map((r) => (!onlyEnabled || r.enabled ? { ...r, ...updates } : r)),
    );
    markDirty();
  };

  return {
    variantMode,
    setVariantMode,
    sku,
    setSku,
    skuEdited,
    setSkuEdited,
    barcode,
    setBarcode,
    simpleInitialStock,
    setSimpleInitialStock,
    optionAxes,
    setOptionAxes,
    matrixRows,
    setMatrixRows,
    activeAxes,
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
  };
}
