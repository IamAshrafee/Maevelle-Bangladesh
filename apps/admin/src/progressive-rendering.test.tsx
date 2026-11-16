import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { TableSkeletonRows, CardSkeletonStack, StatsValueSkeleton } from '../components/ui/table-skeleton';
import { BasicInfoCard } from '../components/products/creator/basic-info-card';
import { HierarchicalCategoryPicker } from '../components/products/creator/hierarchical-category-picker';
import { OrganizationSidebar } from '../components/products/creator/organization-sidebar';
import { PromotionsTable } from '../components/promotions/promotions-table';
import { CatalogClassificationConsole } from '../components/catalog-classification/catalog-classification-console';
import { InventoryDashboard } from '../components/inventory/inventory-dashboard';
import { AdminCapabilitiesProvider } from '../components/admin-capabilities';
import type { PromotionItem } from '../components/promotions/types';

vi.mock('../components/catalog-classification/classification-api', async () => {
  const actual = await vi.importActual<any>('../components/catalog-classification/classification-api');
  return {
    ...actual,
    classificationRequest: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock('../lib/inventory/api', async () => {
  const actual = await vi.importActual<any>('../lib/inventory/api');
  return {
    ...actual,
    inventoryRequest: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/products/new',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Progressive Rendering & Data Loading Architecture', () => {
  describe('Unified Table & Card Skeleton Primitives', () => {
    it('TableSkeletonRows renders the requested number of rows and columns with tabular alignment', () => {
      const html = renderToStaticMarkup(
        <table>
          <tbody>
            <TableSkeletonRows columns={5} rows={3} />
          </tbody>
        </table>,
      );

      // Verify 3 <tr> rows
      const rowMatches = html.match(/<tr/g);
      expect(rowMatches).toHaveLength(3);

      // Verify 3 * 5 = 15 <td> cells
      const cellMatches = html.match(/<td/g);
      expect(cellMatches).toHaveLength(15);
    });

    it('CardSkeletonStack renders accessible aria-busy card placeholders for mobile views', () => {
      const html = renderToStaticMarkup(<CardSkeletonStack count={4} />);

      expect(html).toContain('aria-busy="true"');
      // Should have 4 card containers
      const cardMatches = html.match(/rounded-xl border border-border/g);
      expect(cardMatches).toHaveLength(4);
    });

    it('StatsValueSkeleton renders a mono-width placeholder without causing layout shifts', () => {
      const html = renderToStaticMarkup(<StatsValueSkeleton className="custom-test" />);

      expect(html).toContain('custom-test');
      expect(html).toContain('animate-pulse');
    });
  });

  describe('Example A: Create Product Progressive Decoupling', () => {
    describe('BasicInfoCard', () => {
      it('renders title, handle, and description inputs immediately while classification types are loading', () => {
        const html = renderToStaticMarkup(
          <BasicInfoCard
            title="Summer Linen Shirt"
            handle="summer-linen-shirt"
            isHandleLocked={false}
            description="100% pure organic linen"
            productTypeId=""
            types={[]}
            typesLoading={true}
            typesError={null}
            activeAttributes={[]}
            attributeValues={{}}
            fieldErrors={{}}
            onTitleChange={vi.fn()}
            onHandleChange={vi.fn()}
            onToggleHandleLock={vi.fn()}
            onDescriptionChange={vi.fn()}
            onProductTypeChange={vi.fn()}
            onAttributeChange={vi.fn()}
          />,
        );

        // Title input is rendered and populated
        expect(html).toContain('Summer Linen Shirt');
        expect(html).toContain('id="product-title"');

        // Handle input is rendered and populated
        expect(html).toContain('summer-linen-shirt');
        expect(html).toContain('id="product-handle"');

        // Description textarea is rendered and populated
        expect(html).toContain('100% pure organic linen');
        expect(html).toContain('id="product-description"');

        // Product type dropdown indicates loading state without blocking other fields
        expect(html).toContain('Loading product classifications…');
      });

      it('displays localized error banner with retry when product types fail to load', () => {
        const html = renderToStaticMarkup(
          <BasicInfoCard
            title=""
            handle=""
            isHandleLocked={false}
            description=""
            productTypeId=""
            types={[]}
            typesLoading={false}
            typesError="Types endpoint timed out"
            activeAttributes={[]}
            attributeValues={{}}
            fieldErrors={{}}
            onTitleChange={vi.fn()}
            onHandleChange={vi.fn()}
            onToggleHandleLock={vi.fn()}
            onDescriptionChange={vi.fn()}
            onProductTypeChange={vi.fn()}
            onAttributeChange={vi.fn()}
            onRetryTypes={vi.fn()}
          />,
        );

        expect(html).toContain('Types endpoint timed out');
        expect(html).toContain('Retry');
      });
    });

    describe('HierarchicalCategoryPicker', () => {
      it('renders localized skeleton tree when categories are loading without unmounting card shell', () => {
        const html = renderToStaticMarkup(
          <HierarchicalCategoryPicker
            categories={[]}
            selectedCategoryIds={[]}
            primaryCategoryId=""
            isLoading={true}
            error={null}
            onToggleCategory={vi.fn()}
            onSelectPrimaryCategory={vi.fn()}
          />,
        );

        // Shell is intact
        expect(html).toContain('Categories');
        // Contains loading skeleton with aria-busy
        expect(html).toContain('aria-busy="true"');
      });

      it('renders localized error alert and retry button when category loading fails', () => {
        const html = renderToStaticMarkup(
          <HierarchicalCategoryPicker
            categories={[]}
            selectedCategoryIds={[]}
            primaryCategoryId=""
            isLoading={false}
            error="Failed to fetch category tree"
            onRetry={vi.fn()}
            onToggleCategory={vi.fn()}
            onSelectPrimaryCategory={vi.fn()}
          />,
        );

        expect(html).toContain('Failed to fetch category tree');
        expect(html).toContain('Retry Categories');
      });
    });

    describe('OrganizationSidebar', () => {
      it('renders localized skeleton badges for tags, occasions, and collections during loading', () => {
        const html = renderToStaticMarkup(
          <OrganizationSidebar
            tags={[]}
            occasions={[]}
            collections={[]}
            categories={[]}
            sizingData={{ systems: [], sizeDefinitions: [] }}
            sizeGuides={[]}
            selectedTagIds={[]}
            selectedOccasionIds={[]}
            selectedCollectionIds={[]}
            selectedCategoryIds={[]}
            primaryCategoryId=""
            sizeSystemId=""
            sizeGuideId=""
            sizingGuideSource="NONE"
            noGuideReason=""
            publishImmediately={false}
            readinessChecklist={{
              items: [],
              progressPercent: 0,
              isReadyToPublish: false,
            }}
            tagsLoading={true}
            occasionsLoading={true}
            collectionsLoading={true}
            categoriesLoading={true}
            sizingLoading={true}
            onToggleCategory={vi.fn()}
            onSelectPrimaryCategory={vi.fn()}
            onToggleTag={vi.fn()}
            onToggleOccasion={vi.fn()}
            onToggleCollection={vi.fn()}
            onSizeSystemChange={vi.fn()}
            onSizeGuideChange={vi.fn()}
            onSizingGuideSourceChange={vi.fn()}
            onNoGuideReasonChange={vi.fn()}
            onPublishImmediatelyChange={vi.fn()}
          />,
        );

        // Sidebar card shells are rendered
        expect(html).toContain('Publication Readiness');
        expect(html).toContain('Taxonomy &amp; Badges');

        // Does NOT falsely claim "No active tags configured" while loading
        expect(html).not.toContain('No active tags configured');
        expect(html).not.toContain('No active occasions configured');
        expect(html).not.toContain('No active collections configured');

        // Instead renders animate-pulse placeholders
        expect(html).toContain('animate-pulse');
      });
    });
  });

  describe('PromotionsTable Progressive Table Rendering', () => {
    it('renders 5 realistic table skeleton rows on initial load instead of empty whitespace', () => {
      const html = renderToStaticMarkup(
        <PromotionsTable
          promotions={[]}
          loading={true}
          onSelectPromotion={vi.fn()}
          onEditPromotion={vi.fn()}
          onStatusChange={vi.fn()}
          onAddCoupon={vi.fn()}
          onCreateNew={vi.fn()}
        />,
      );

      // Verify table headers are rendered
      expect(html).toContain('Campaign');
      expect(html).toContain('Status');
      expect(html).toContain('Benefit');

      // Verify skeleton rows are present (5 rows * 8 columns = 40 cells)
      const cellMatches = html.match(/<td/g);
      expect(cellMatches).toHaveLength(40);
    });

    it('renders empty state only when not loading and promotions array is empty', () => {
      const html = renderToStaticMarkup(
        <PromotionsTable
          promotions={[]}
          loading={false}
          onSelectPromotion={vi.fn()}
          onEditPromotion={vi.fn()}
          onStatusChange={vi.fn()}
          onAddCoupon={vi.fn()}
          onCreateNew={vi.fn()}
        />,
      );

      expect(html).toContain('No promotions yet');
      expect(html).toContain('Create First Promotion');
    });

    it('applies opacity-60 updating indicator during background refresh with existing promotions', () => {
      const mockPromo: PromotionItem = {
        id: 'promo-1',
        name: 'Eid Super Sale',
        promotionType: 'AUTOMATIC',
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
        priority: 1,
        benefitType: 'PERCENTAGE_DISCOUNT',
        benefitValue: '20',
        minimumMerchandiseSubtotal: null,
        combinability: 'EXCLUSIVE',
        coupons: [],
        committedUsageCount: 0,
        committedDiscount: '0',
        createdAt: '2026-04-01T00:00:00Z',
      };

      const html = renderToStaticMarkup(
        <PromotionsTable
          promotions={[mockPromo]}
          loading={true}
          onSelectPromotion={vi.fn()}
          onEditPromotion={vi.fn()}
          onStatusChange={vi.fn()}
          onAddCoupon={vi.fn()}
          onCreateNew={vi.fn()}
        />,
      );

      // Existing promotion row is preserved
      expect(html).toContain('Eid Super Sale');
      // Background updating class is present
      expect(html).toContain('opacity-60 transition-opacity');
    });
  });

  describe('Example B: Categories Management Progressive Architecture', () => {
    it('renders page header, Add Category action, tabs, and skeleton stats immediately on mount', () => {
      const html = renderToStaticMarkup(<CatalogClassificationConsole />);

      // Shell & Actions are immediately visible
      expect(html).toContain('Product organization');
      expect(html).toContain('How it works');
      expect(html).toContain('Create');
      expect(html).toContain('Categories');
      expect(html).toContain('Tags');
      expect(html).toContain('Occasions');
      expect(html).toContain('Collections');

      // Stats cards show skeleton placeholders rather than false "0" counts
      expect(html).toContain('Total');
      expect(html).toContain('Active');
      expect(html).toContain('Inactive');
      expect(html).toContain('Archived');
      expect(html).toContain('animate-pulse');

      // Table body renders skeleton rows and cells on initial mount
      expect(html).toContain('data-slot="skeleton"');
      const skeletonCells = html.match(/data-slot="skeleton"/g);
      expect(skeletonCells && skeletonCells.length >= 10).toBe(true);
    });
  });

  describe('InventoryDashboard Progressive Architecture', () => {
    it('renders page header, replenishment link, and 6 KPI card skeletons without full-page spinner', () => {
      const html = renderToStaticMarkup(
        <AdminCapabilitiesProvider capabilities={['inventory.view', 'inventory.transfer', 'inventory.stocktake']}>
          <InventoryDashboard />
        </AdminCapabilitiesProvider>,
      );

      // Header is rendered
      expect(html).toContain('Inventory overview');
      expect(html).toContain('Replenishment');
      expect(html).toContain('New transfer');
      expect(html).toContain('Start count');

      // Does NOT render whole-page LoadingState spinner
      expect(html).not.toContain('Loading the inventory operations snapshot…');

      // Renders 6 KPI skeleton cards
      expect(html).toContain('On hand');
      expect(html).toContain('Available to sell');
      expect(html).toContain('Reserved');
      expect(html).toContain('Unavailable');
      expect(html).toContain('Incoming supply');
      expect(html).toContain('Transfer in transit');

      // Skeletons are active
      expect(html).toContain('aria-busy="true"');
    });
  });
});
