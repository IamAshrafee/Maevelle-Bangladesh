'use client';

import { Banknote, Save } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

import type { PaymentMethodDto } from '@maevelle/contracts';

import { StatusBadge } from '../status-badge';

interface PaymentMethodSettingsProps {
  readonly methods: readonly PaymentMethodDto[];
  readonly busy: boolean;
  readonly onSave: (method: PaymentMethodDto, form: HTMLFormElement) => void | Promise<void>;
}

export function PaymentMethodSettings({ methods, busy, onSave }: PaymentMethodSettingsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {methods.map((method) => (
        <form
          key={method.id}
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(method, event.currentTarget);
          }}
          className="flex flex-col"
        >
          <Card className="flex flex-1 flex-col justify-between">
            <div>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {method.code}
                    </Badge>
                  </div>
                  <CardTitle className="text-base font-semibold">{method.name}</CardTitle>
                </div>
                <StatusBadge status={method.status} />
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-1.5">
                  <Label htmlFor={`name-${method.id}`}>Display name</Label>
                  <Input
                    id={`name-${method.id}`}
                    defaultValue={method.name}
                    name="name"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`status-${method.id}`}>Status</Label>
                    <NativeSelect
                      id={`status-${method.id}`}
                      defaultValue={method.status}
                      name="status"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="DISABLED">Disabled</option>
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`order-${method.id}`}>Display order</Label>
                    <Input
                      id={`order-${method.id}`}
                      defaultValue={method.displayOrder}
                      min={0}
                      name="displayOrder"
                      type="number"
                      required
                    />
                  </div>
                </div>
                {method.code !== 'COD' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor={`window-${method.id}`}>Payment window (minutes)</Label>
                      <Input
                        id={`window-${method.id}`}
                        defaultValue={method.paymentWindowMinutes ?? 1440}
                        min={15}
                        max={10080}
                        name="paymentWindowMinutes"
                        type="number"
                        required
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Unpaid checkout sessions expire after this window unless verified.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`acct-${method.id}`}>Customer-visible wallet / number</Label>
                      <Input
                        id={`acct-${method.id}`}
                        defaultValue={method.instructions.accountNumber}
                        inputMode="numeric"
                        name="accountNumber"
                        placeholder="e.g. 01700000000"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`instructions-${method.id}`}>Checkout instructions</Label>
                      <Textarea
                        id={`instructions-${method.id}`}
                        defaultValue={method.instructions.text}
                        name="instructions"
                        rows={3}
                        placeholder="Instructions displayed to customers during checkout..."
                      />
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
                    Cash on delivery collects funds after successful delivery and settles through
                    treasury courier remittances.
                  </div>
                )}
              </CardContent>
            </div>
            <CardFooter className="pt-2">
              <Button disabled={busy} type="submit" size="sm" className="w-full gap-1.5">
                <Save className="size-3.5" aria-hidden="true" />
                Save method
              </Button>
            </CardFooter>
          </Card>
        </form>
      ))}
    </div>
  );
}
