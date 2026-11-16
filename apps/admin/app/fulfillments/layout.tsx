import { ModuleLayout } from '@/components/ui/module-nav';

export default function FulfillmentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleLayout
      moduleId="delivery"
      widthVariant="wide"
      ariaLabel="Delivery, fulfillment & returns navigation"
    >
      {children}
    </ModuleLayout>
  );
}
