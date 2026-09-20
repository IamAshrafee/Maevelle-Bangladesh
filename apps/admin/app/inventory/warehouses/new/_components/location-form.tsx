'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowLeft,
  Boxes,
  Building2,
  Check,
  Info,
  Loader2,
  Save,
  Sparkles,
  Truck,
} from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { LocationCapability, LocationType } from '@maevelle/contracts';
import { inventoryRequest } from '@/lib/inventory/api';
import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const LOCATION_TYPES: readonly {
  value: LocationType;
  label: string;
  description: string;
}[] = [
  {
    value: 'WAREHOUSE',
    label: 'Warehouse',
    description: 'Primary storage, intake, and replenishment depot',
  },
  {
    value: 'FULFILLMENT_CENTER',
    label: 'Fulfillment Center',
    description: 'High-throughput outbound order picking and shipping',
  },
  {
    value: 'RETAIL_STORE',
    label: 'Retail Store',
    description: 'Physical shop with walk-in sales and customer pickup',
  },
  {
    value: 'SHOWROOM',
    label: 'Showroom',
    description: 'Display space with sample units and collections',
  },
  {
    value: 'RETURN_CENTER',
    label: 'Return Center',
    description: 'Inspection and restocking depot for customer returns',
  },
  {
    value: 'THIRD_PARTY',
    label: 'Third-Party Logistics (3PL)',
    description: 'Outsourced partner facility holding distributed stock',
  },
  {
    value: 'OTHER',
    label: 'Other Location',
    description: 'Specialized facility or temporary staging buffer',
  },
];

export const LOCATION_STATUS_OPTIONS = [
  {
    value: 'ACTIVE',
    label: 'Active (Operational)',
    description: 'Immediately ready to hold stock, receive shipments, and fulfill orders',
  },
  {
    value: 'DRAFT',
    label: 'Draft (Setup Mode)',
    description: 'Under setup or physical racking; transactions disabled until activated',
  },
] as const;

export const CAPABILITY_GROUPS = [
  {
    group: 'Inventory & Storage',
    description: 'Physical storage and internal buffer capacity',
    icon: Boxes,
    items: [
      {
        code: 'STOCK_HOLDING' as LocationCapability,
        label: 'Stock Holding',
        desc: 'Holds physical inventory units across sellable and damaged conditions',
      },
      {
        code: 'INTERNAL_STORAGE' as LocationCapability,
        label: 'Internal Storage',
        desc: 'Dedicated backroom, staging, or buffer area not directly allocated',
      },
    ],
  },
  {
    group: 'Inbound & Receiving',
    description: 'Intake from suppliers and customer returns',
    icon: ArrowDownLeft,
    items: [
      {
        code: 'PURCHASE_RECEIVING' as LocationCapability,
        label: 'Purchase Receiving',
        desc: 'Receives purchase orders and inbound shipments from suppliers',
      },
      {
        code: 'RETURN_RECEIVING' as LocationCapability,
        label: 'Return Receiving',
        desc: 'Accepts and restocks customer returns and failed deliveries',
      },
    ],
  },
  {
    group: 'Fulfillment & Outbound',
    description: 'Customer order picking, packing, and dispatch',
    icon: Building2,
    items: [
      {
        code: 'ORDER_FULFILLMENT' as LocationCapability,
        label: 'Order Fulfillment',
        desc: 'Allocates, picks, packs, and dispatches customer orders',
      },
      {
        code: 'CUSTOMER_PICKUP' as LocationCapability,
        label: 'Customer Pickup',
        desc: 'Supports click-and-collect and over-the-counter customer handoff',
      },
    ],
  },
  {
    group: 'Inter-Warehouse Transfers',
    description: 'Inventory movement between company locations',
    icon: Truck,
    items: [
      {
        code: 'TRANSFER_SEND' as LocationCapability,
        label: 'Transfer Send',
        desc: 'Dispatches stock transfers to other company warehouses',
      },
      {
        code: 'TRANSFER_RECEIVE' as LocationCapability,
        label: 'Transfer Receive',
        desc: 'Receives and confirms incoming transfers from other facilities',
      },
    ],
  },
] as const;

export const TYPE_DEFAULT_CAPABILITIES: Record<LocationType, readonly LocationCapability[]> = {
  WAREHOUSE: [
    'STOCK_HOLDING',
    'PURCHASE_RECEIVING',
    'ORDER_FULFILLMENT',
    'TRANSFER_SEND',
    'TRANSFER_RECEIVE',
    'INTERNAL_STORAGE',
  ],
  FULFILLMENT_CENTER: [
    'STOCK_HOLDING',
    'ORDER_FULFILLMENT',
    'TRANSFER_SEND',
    'TRANSFER_RECEIVE',
  ],
  RETAIL_STORE: [
    'STOCK_HOLDING',
    'ORDER_FULFILLMENT',
    'CUSTOMER_PICKUP',
    'TRANSFER_RECEIVE',
  ],
  SHOWROOM: [
    'STOCK_HOLDING',
    'CUSTOMER_PICKUP',
    'TRANSFER_RECEIVE',
  ],
  RETURN_CENTER: [
    'STOCK_HOLDING',
    'RETURN_RECEIVING',
    'TRANSFER_SEND',
  ],
  THIRD_PARTY: [
    'STOCK_HOLDING',
    'PURCHASE_RECEIVING',
    'ORDER_FULFILLMENT',
    'TRANSFER_SEND',
    'TRANSFER_RECEIVE',
  ],
  OTHER: [
    'STOCK_HOLDING',
    'INTERNAL_STORAGE',
  ],
};

function deriveCodeFromName(name: string, type: LocationType): string {
  const prefix =
    type === 'WAREHOUSE'
      ? 'WH'
      : type === 'FULFILLMENT_CENTER'
        ? 'FC'
        : type === 'RETAIL_STORE'
          ? 'STORE'
          : type === 'SHOWROOM'
            ? 'SHOW'
            : type === 'RETURN_CENTER'
              ? 'RET'
              : type === 'THIRD_PARTY'
                ? '3PL'
                : 'LOC';

  const cleanWords = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 1 &&
        !['WAREHOUSE', 'CENTER', 'STORE', 'SHOWROOM', 'DEPOT', 'FACILITY', 'LOCATION'].includes(w),
    );

  const slug = cleanWords.slice(0, 2).join('-');
  return slug ? `${prefix}-${slug}` : `${prefix}-01`;
}

const formSchema = z.object({
  name: z.string().trim().min(2, 'Facility name must be at least 2 characters'),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Location code must be at least 2 characters')
    .max(20, 'Location code cannot exceed 20 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Code may only contain uppercase letters, numbers, hyphens, and underscores',
    ),
  locationType: z.enum([
    'WAREHOUSE',
    'SHOWROOM',
    'RETAIL_STORE',
    'FULFILLMENT_CENTER',
    'RETURN_CENTER',
    'THIRD_PARTY',
    'OTHER',
  ] as const),
  status: z.enum(['ACTIVE', 'DRAFT'] as const),
  capabilities: z
    .array(z.string())
    .min(1, 'A location must maintain at least one operational capability'),
  fullAddress: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function LocationForm() {
  const router = useRouter();
  const canManage = useAdminCapability('warehouse.manage');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      locationType: 'WAREHOUSE',
      status: 'ACTIVE',
      capabilities: [...TYPE_DEFAULT_CAPABILITIES.WAREHOUSE],
      fullAddress: '',
      city: '',
      postalCode: '',
      countryCode: 'BD',
    },
  });

  const selectedCapabilities = form.watch('capabilities');
  const selectedType = form.watch('locationType') as LocationType;
  const currentName = form.watch('name');

  const handleTypeChange = (newType: LocationType) => {
    form.setValue('locationType', newType, { shouldValidate: true });
    const defaultCaps = TYPE_DEFAULT_CAPABILITIES[newType];
    if (defaultCaps) {
      form.setValue('capabilities', [...defaultCaps], { shouldValidate: true });
    }
  };

  const handleToggleCapability = (capability: LocationCapability) => {
    const current = form.getValues('capabilities');
    if (current.includes(capability)) {
      if (current.length === 1) {
        setErrorMessage('A location must maintain at least one operational capability.');
        return;
      }
      setErrorMessage('');
      form.setValue(
        'capabilities',
        current.filter((c) => c !== capability),
        { shouldValidate: true },
      );
    } else {
      setErrorMessage('');
      form.setValue('capabilities', [...current, capability], { shouldValidate: true });
    }
  };

  const handleApplyPreset = (presetCaps: readonly LocationCapability[]) => {
    form.setValue('capabilities', [...presetCaps], { shouldValidate: true });
    setErrorMessage('');
  };

  const handleGenerateCode = () => {
    if (!currentName.trim()) {
      setErrorMessage('Enter a facility name first to generate a suggested location code.');
      return;
    }
    const generated = deriveCodeFromName(currentName, selectedType);
    form.setValue('code', generated, { shouldValidate: true });
    setErrorMessage('');
  };

  const onSubmit = async (values: FormValues) => {
    setErrorMessage('');

    const addressPayload =
      values.fullAddress || values.city || values.postalCode
        ? {
            fullAddress: values.fullAddress || undefined,
            city: values.city || undefined,
            postalCode: values.postalCode || undefined,
            countryCode: values.countryCode || 'BD',
          }
        : undefined;

    try {
      const result = await inventoryRequest<{ data: { id: string } }>('/warehouse/locations', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name.trim(),
          code: values.code.trim().toUpperCase(),
          locationType: values.locationType,
          status: values.status,
          capabilities: values.capabilities,
          ...(addressPayload ? { address: addressPayload } : {}),
        }),
      });

      router.push(`/inventory/warehouses/${result.data.id}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.toLowerCase().includes('already exists') || raw.toLowerCase().includes('conflict')) {
        setErrorMessage(
          `Location code "${values.code.toUpperCase()}" is already registered. Please choose a distinct code.`,
        );
      } else {
        setErrorMessage(raw || 'The location could not be created.');
      }
    }
  };

  if (!canManage) {
    return (
      <main className="mx-auto min-w-0 max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <Breadcrumb
          mobileMode="back"
          items={[
            { label: 'Inventory', href: '/inventory' },
            { label: 'Locations', href: '/inventory/warehouses' },
            { label: 'Create Location', current: true },
          ]}
        />
        <OperationalFeedback tone="danger">
          You do not have permission to create locations. The `warehouse.manage` capability is
          required. Contact an administrator to adjust your access.
        </OperationalFeedback>
        <div>
          <Button variant="outline" render={<Link href="/inventory/warehouses" />}>
            <ArrowLeft className="mr-2 size-4" /> Back to locations
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-w-0 max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Locations', href: '/inventory/warehouses' },
          { label: 'Create Location', current: true },
        ]}
      />

      {/* Header bar */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            type="button"
            className="size-8 shrink-0"
            render={<Link href="/inventory/warehouses" />}
            title="Back to locations"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Create Location</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add a warehouse, fulfillment center, retail store, or triage facility.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            type="button"
            render={<Link href="/inventory/warehouses" />}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            form="create-location-form"
            disabled={form.formState.isSubmitting}
            className="min-w-28"
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="mr-1.5 size-3.5" /> Save Location
              </>
            )}
          </Button>
        </div>
      </header>

      {errorMessage ? (
        <OperationalFeedback tone="danger">{errorMessage}</OperationalFeedback>
      ) : null}

      <form
        id="create-location-form"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        {/* General Information Card */}
        <Card className="shadow-xs">
          <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3">
            <CardTitle className="text-base font-semibold">General Information</CardTitle>
            <CardDescription className="text-xs">
              Basic identity, facility classification, and operating status.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Facility Name */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="location-name" className="text-xs font-medium">
                  Facility Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="location-name"
                  placeholder="e.g. Tejgaon Central Depot, Banani Store"
                  className="h-9 text-sm"
                  {...form.register('name')}
                />
                {form.formState.errors.name ? (
                  <p className="text-[11px] font-medium text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              {/* Location Code with Generator */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="location-code" className="text-xs font-medium">
                    Location Code <span className="text-destructive">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    title="Auto-generate an uppercase code based on name"
                  >
                    <Sparkles className="size-3" /> Auto-suggest
                  </button>
                </div>
                <Input
                  id="location-code"
                  placeholder="e.g. WH-TEJGAON-01"
                  className="h-9 font-mono uppercase text-sm"
                  {...form.register('code', {
                    onChange: (e) => {
                      e.target.value = e.target.value.toUpperCase();
                    },
                  })}
                />
                {form.formState.errors.code ? (
                  <p className="text-[11px] font-medium text-destructive">
                    {form.formState.errors.code.message}
                  </p>
                ) : null}
              </div>

              {/* Facility Type */}
              <div className="space-y-1.5">
                <Label htmlFor="location-type" className="text-xs font-medium">
                  Facility Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedType}
                  items={LOCATION_TYPES}
                  onValueChange={(val) => handleTypeChange(val as LocationType)}
                >
                  <SelectTrigger id="location-type" className="h-9 text-sm">
                    <SelectValue placeholder="Select facility type" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_TYPES.map((type) => (
                      <SelectItem
                        key={type.value}
                        value={type.value}
                        description={type.description}
                      >
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.locationType ? (
                  <p className="text-[11px] font-medium text-destructive">
                    {form.formState.errors.locationType.message}
                  </p>
                ) : null}
              </div>

              {/* Initial Operating Status */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="location-status" className="text-xs font-medium">
                  Initial Status
                </Label>
                <Select
                  value={form.watch('status')}
                  items={LOCATION_STATUS_OPTIONS}
                  onValueChange={(val) =>
                    form.setValue('status', val as 'ACTIVE' | 'DRAFT', { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="location-status" className="h-9 text-sm">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_STATUS_OPTIONS.map((status) => (
                      <SelectItem
                        key={status.value}
                        value={status.value}
                        description={status.description}
                      >
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operational Capabilities Card */}
        <Card className="shadow-xs">
          <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Operational Capabilities</CardTitle>
              <CardDescription className="text-xs">
                Select which workflows this facility is authorized to handle.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-7 text-xs"
                onClick={() =>
                  handleApplyPreset(
                    TYPE_DEFAULT_CAPABILITIES[selectedType] ?? TYPE_DEFAULT_CAPABILITIES.WAREHOUSE,
                  )
                }
                title="Reset to recommended capabilities for the chosen facility type"
              >
                Reset to {LOCATION_TYPES.find((t) => t.value === selectedType)?.label ?? 'Default'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-7 text-xs"
                onClick={() =>
                  handleApplyPreset(CAPABILITY_GROUPS.flatMap((g) => g.items.map((i) => i.code)))
                }
                title="Enable all operational capabilities"
              >
                Select All
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
            {form.formState.errors.capabilities ? (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs font-medium text-destructive">
                {form.formState.errors.capabilities.message}
              </p>
            ) : null}

            {CAPABILITY_GROUPS.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.group} className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <GroupIcon className="size-3.5" />
                    <span>{group.group}</span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const isSelected = selectedCapabilities.includes(item.code);
                      return (
                        <button
                          key={item.code}
                          type="button"
                          onClick={() => handleToggleCapability(item.code)}
                          className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20'
                              : 'border-border bg-card hover:bg-muted/30'
                          }`}
                        >
                          <div
                            className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors ${
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/30 bg-background'
                            }`}
                          >
                            {isSelected ? <Check className="size-2.5 stroke-[3]" /> : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-medium leading-tight">
                              {item.label}
                            </span>
                            <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight">
                              {item.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0 text-primary mt-0.5" />
              <span>
                <strong>Purchase Receiving:</strong> Required for warehouses that receive supplier purchase orders and freight shipments.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Physical Address Card */}
        <Card className="shadow-xs">
          <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3">
            <CardTitle className="text-base font-semibold">Physical Address</CardTitle>
            <CardDescription className="text-xs">
              Facility location used for bills of lading, transfer dispatches, and courier pickups.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Full Address */}
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="address-full" className="text-xs font-medium">
                  Street / Facility Address
                </Label>
                <Input
                  id="address-full"
                  placeholder="e.g. Plot 24, Road 7, Sector 3, Uttara Commercial Area"
                  className="h-9 text-sm"
                  {...form.register('fullAddress')}
                />
              </div>

              {/* City */}
              <div className="space-y-1.5">
                <Label htmlFor="address-city" className="text-xs font-medium">
                  City / District
                </Label>
                <Input
                  id="address-city"
                  placeholder="e.g. Dhaka"
                  className="h-9 text-sm"
                  {...form.register('city')}
                />
              </div>

              {/* Postal Code */}
              <div className="space-y-1.5">
                <Label htmlFor="address-postal" className="text-xs font-medium">
                  Postal Code
                </Label>
                <Input
                  id="address-postal"
                  placeholder="e.g. 1230"
                  className="h-9 text-sm font-mono"
                  {...form.register('postalCode')}
                />
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <Label htmlFor="address-country" className="text-xs font-medium">
                  Country
                </Label>
                <Input
                  id="address-country"
                  value="Bangladesh (BD)"
                  disabled
                  className="h-9 bg-muted/40 text-muted-foreground text-xs font-medium"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bottom Submission Bar */}
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            type="button"
            render={<Link href="/inventory/warehouses" />}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={form.formState.isSubmitting}
            className="min-w-32"
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving Location…
              </>
            ) : (
              <>
                <Save className="mr-1.5 size-3.5" /> Save Location
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}
