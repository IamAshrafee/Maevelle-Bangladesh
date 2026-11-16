'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ScanBarcode } from 'lucide-react';
import type { UnitBarcodeLookupDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { PageHeader, PagePanel, PageSection } from '@/components/ui/page-shell';
import { ImmersiveWorkspace } from '@/components/workspaces/immersive-workspace';
import { UnitScannerInput } from '@/components/inventory/units/unit-scanner-input';
import { UnitScanResult } from '@/components/inventory/units/unit-scan-result';

export default function InventoryUnitScanPage() {
  const [result, setResult] = useState<UnitBarcodeLookupDto | null>(null);

  return (
    <ImmersiveWorkspace>
      <div className="shrink-0 border-b border-border bg-card/85 backdrop-blur-md px-4 py-3 md:px-6">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            breadcrumbs={[
              { label: 'Inventory', href: '/inventory' },
              { label: 'Quality', href: '/inventory/units' },
              { label: 'Scan unit', current: true },
            ]}
            eyebrow="Warehouse Terminal"
            title="Scan a physical unit"
            description="Use a handheld scanner, device camera, or Unit Code to find one exact inventory identity and continue its authorized workflow."
            className="border-b-0 pb-0"
            actions={
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 md:min-h-9"
                nativeButton={false}
                render={<Link href="/inventory/units" />}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                <span>Unit Queue</span>
              </Button>
            }
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-6 md:py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] md:pb-8">
        <PageSection className="mx-auto w-full max-w-2xl space-y-5">
          <PagePanel className="space-y-3 p-4 md:p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ScanBarcode className="size-4 text-primary" aria-hidden="true" />
              <span>Scan or enter a Unit Code</span>
            </div>
            <UnitScannerInput autoFocus size="lg" onUnitFound={setResult} />
          </PagePanel>
          {result ? <UnitScanResult result={result} onResultChange={setResult} /> : null}
        </PageSection>
      </div>
    </ImmersiveWorkspace>
  );
}
