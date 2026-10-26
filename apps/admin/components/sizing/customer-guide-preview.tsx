import type { PublicSizeGuideDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';

function valueLabel(
  value: PublicSizeGuideDto['rows'][number]['values'][number] | undefined,
): string {
  if (!value) return '—';
  const number = value.exact ?? (value.min && value.max ? `${value.min}–${value.max}` : '—');
  return `${value.isApproximate ? '~' : ''}${number} ${value.unit}`;
}

export function CustomerGuidePreview({ guide }: { guide: PublicSizeGuideDto }) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="space-y-3 border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">{guide.name}</h2>
          <Badge variant="outline">
            {guide.measurementBasis === 'GARMENT' ? 'Garment measurements' : 'Body measurements'}
          </Badge>
        </div>
        {guide.fitNotes ? <p className="text-sm text-foreground">{guide.fitNotes}</p> : null}
        {guide.instructions ? (
          <p className="text-sm leading-6 text-muted-foreground">{guide.instructions}</p>
        ) : null}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
            <tr>
              <th className="sticky left-0 bg-muted px-4 py-3">Size / fit</th>
              {guide.columns.map((column) => (
                <th key={column.id} className="px-4 py-3">
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {guide.rows.map((row) => (
              <tr key={row.id}>
                <th className="sticky left-0 bg-card px-4 py-3 font-semibold">{row.label}</th>
                {guide.columns.map((column) => (
                  <td key={column.id} className="px-4 py-3 font-mono tabular-nums">
                    {valueLabel(row.values.find((value) => value.columnId === column.id))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {guide.columns.some((column) => column.instructions) ? (
        <footer className="space-y-2 border-t border-border bg-muted/20 p-4">
          {guide.columns.map((column) =>
            column.instructions ? (
              <p key={column.id} className="text-xs leading-5 text-muted-foreground">
                <strong className="text-foreground">{column.name}:</strong> {column.instructions}
              </p>
            ) : null,
          )}
        </footer>
      ) : null}
    </article>
  );
}
