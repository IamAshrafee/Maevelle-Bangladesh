import { Label } from '@/components/ui/label';

export function InventoryField({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-[0.8rem] font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
