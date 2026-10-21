'use client';

import { useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import type { UnitBarcodeLookupDto } from '@maevelle/contracts';

import { Breadcrumb } from '@/components/ui/breadcrumb';
import { AdminPage, PageHeader, PagePanel, PageSection } from '@/components/ui/page-shell';
import { UnitScannerInput } from '@/components/inventory/units/unit-scanner-input';
import { UnitScanResult } from '@/components/inventory/units/unit-scan-result';

export default function InventoryUnitScanPage() {
  const [result, setResult] = useState<UnitBarcodeLookupDto | null>(null);

  return (
    <AdminPage>
      <Breadcrumb
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Quality', href: '/inventory/units' },
          { label: 'Scan unit', current: true },
        ]}
      />
      <PageHeader
        eyebrow="Quality"
        title="Scan a physical unit"
        description="Use a handheld scanner, device camera, or Unit Code to find one exact inventory identity and continue its authorized workflow."
      />
      <PageSection className="mx-auto w-full max-w-xl">
        <PagePanel className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ScanBarcode className="size-4 text-primary" />
            Scan or enter a Unit Code
          </div>
          <UnitScannerInput autoFocus size="lg" onUnitFound={setResult} />
        </PagePanel>
        {result ? <UnitScanResult result={result} onResultChange={setResult} /> : null}
      </PageSection>
    </AdminPage>
  );
}
