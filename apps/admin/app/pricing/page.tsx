import { PricingWorkspace } from '@/components/pricing/pricing-workspace';
import { ModuleLayout } from '@/components/ui/module-nav';

export default function PricingPage() {
  return (
    <ModuleLayout moduleId="products" widthVariant="wide" ariaLabel="Catalog navigation">
      <PricingWorkspace />
    </ModuleLayout>
  );
}
