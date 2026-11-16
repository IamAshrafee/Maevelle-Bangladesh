import { ModuleLayout } from '@/components/ui/module-nav';

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
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
