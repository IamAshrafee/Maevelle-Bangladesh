import { AlertCircle, FileBox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const PAGE_SIZE = 25;

export function InventoryStatCards({
  stats,
}: {
  stats: { label: string; value: string | number; description?: string }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            {stat.description ? (
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function InventoryConditionBadge({ condition }: { condition: string }) {
  const variant =
    condition === 'SELLABLE'
      ? 'default'
      : condition === 'DAMAGED'
        ? 'destructive'
        : condition === 'QUARANTINE'
          ? 'outline'
          : 'secondary';
  return <Badge variant={variant}>{condition}</Badge>;
}

export function InventoryEmptyState({
  title = 'No records found',
  description = 'There are no records matching your current filters.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center animate-in fade-in-50">
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        <FileBox className="h-10 w-10 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function InventoryFeedback({ message, isError }: { message: string; isError?: boolean }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm ${
        isError ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-secondary-foreground'
      }`}
    >
      {isError ? <AlertCircle className="h-4 w-4" /> : null}
      <p>{message}</p>
    </div>
  );
}

export function InventoryPager({
  page,
  hasNext,
  onPageChange,
}: {
  page: number;
  hasNext: boolean;
  onPageChange: (newPage: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-2">
      <p className="text-sm text-muted-foreground">Page {page}</p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
