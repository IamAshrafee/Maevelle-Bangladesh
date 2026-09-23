import type { MaevelleDatabase } from '../index.js';
import type { LocationCapability } from '../warehouse.js';

export type SeedScope = 'bootstrap' | 'development' | 'test';

export interface SeedRunnerOptions {
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly targetScope?: SeedScope;
  readonly targetModules?: readonly string[];
  readonly organizationCode?: string;
}

export interface SeedContext {
  readonly db: MaevelleDatabase;
  readonly organizationId: string;
  readonly organizationCode: string;
  readonly actorId: string;
  readonly options: SeedRunnerOptions;
}

export interface SeedModuleResult {
  readonly moduleId: string;
  readonly moduleName: string;
  readonly rootCount?: number;
  readonly totalCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly failedCount: number;
  readonly details?: unknown;
}

export interface SeedModule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly scope: SeedScope;
  readonly dependencies?: readonly string[];
  run(context: SeedContext): Promise<SeedModuleResult>;
}

export interface CategorySeedItem {
  readonly name: string;
  readonly handle?: string;
  readonly previousHandles?: readonly string[];
  readonly status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly position?: number;
  readonly defaultSizeGuideId?: string | null;
  readonly children?: readonly CategorySeedItem[];
}

export interface VocabularySeedItem {
  readonly name: string;
  readonly handle?: string;
  readonly previousHandles?: readonly string[];
  readonly description?: string | null;
  readonly status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly position?: number;
}

export interface ProductTypeSeedItem {
  readonly name: string;
  readonly code: string;
  /** Category handle used as this structural type's default catalog placement. */
  readonly primaryCategoryHandle: string;
  readonly status?: 'ACTIVE' | 'ARCHIVED';
}

export interface WarehouseSeedAddress {
  readonly fullAddress?: string;
  readonly city?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly [key: string]: unknown;
}

export interface WarehouseSeedItem {
  readonly code: string;
  readonly name: string;
  readonly locationType?:
    | 'WAREHOUSE'
    | 'FULFILLMENT_CENTER'
    | 'RETAIL_STORE'
    | 'SHOWROOM'
    | 'RETURN_CENTER'
    | 'THIRD_PARTY'
    | 'OTHER';
  readonly status?: 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIVED';
  readonly capabilities?: readonly LocationCapability[];
  readonly address?: WarehouseSeedAddress;
  readonly previousCodes?: readonly string[];
}

export interface ColorSeedItem {
  readonly code: string;
  readonly name: string;
  readonly hexValue: string | null;
  readonly status?: 'ACTIVE' | 'ARCHIVED';
  readonly previousCodes?: readonly string[];
}

export interface FinancialAccountSeedItem {
  readonly accountNumber: string;
  readonly name: string;
  readonly accountType: 'CASH' | 'BANK' | 'MOBILE_WALLET' | 'OTHER';
  readonly currencyCode: string;
  readonly referenceLabel?: string | null;
  readonly openingBalance?: string;
  readonly status?: 'ACTIVE' | 'INACTIVE';
  readonly previousAccountNumbers?: readonly string[];
}

export interface ProductSeedMedia {
  readonly url: string;
  readonly role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly isPrimary?: boolean;
  readonly position?: number;
  readonly colorCode?: string;
}

export interface ProductSeedOptionValue {
  readonly displayValue: string;
  readonly code?: string;
  readonly colorCode?: string;
  readonly sizeCode?: string;
  readonly position?: number;
}

export interface ProductSeedOptionAxis {
  readonly name: string;
  readonly code?: string;
  readonly position?: number;
  readonly values: readonly ProductSeedOptionValue[];
}

export interface ProductSeedStock {
  readonly warehouseCode: string;
  readonly quantity: string;
}

export interface ProductSeedVariantOptionSelection {
  readonly axisName: string;
  readonly valueDisplay: string;
}

export interface ProductSeedVariant {
  readonly sku: string;
  readonly title?: string;
  readonly optionSelections: readonly ProductSeedVariantOptionSelection[];
  readonly amount: string;
  readonly compareAtAmount?: string;
  readonly barcode?: string;
  readonly primaryColorCode?: string;
  readonly weightGrams?: number;
  readonly stocks: readonly ProductSeedStock[];
  readonly media?: readonly ProductSeedMedia[];
}

export interface ProductSeedItem {
  readonly title: string;
  readonly handle?: string;
  readonly productTypeCode: string;
  readonly primaryCategoryHandle: string;
  readonly additionalCategoryHandles?: readonly string[];
  readonly description?: string;
  readonly tagNames?: readonly string[];
  readonly occasionNames?: readonly string[];
  readonly collectionNames?: readonly string[];
  readonly sizeSystemCode?: string;
  readonly options: readonly ProductSeedOptionAxis[];
  readonly variants: readonly ProductSeedVariant[];
  readonly media?: readonly ProductSeedMedia[];
}



