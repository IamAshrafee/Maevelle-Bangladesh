import { RetailPriceReview } from '@/components/products/retail-price-review';
import { ModuleLayout } from '@/components/ui/module-nav';

export default function PriceReviewPage() {
  return (
    <ModuleLayout moduleId="products" widthVariant="wide" ariaLabel="Catalog navigation">
      <RetailPriceReview />
    </ModuleLayout>
  );
}
