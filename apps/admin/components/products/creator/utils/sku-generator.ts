export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateSkuPrefix(title: string, typeName?: string): string {
  const words = (title || typeName || 'PRD').split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]?.toUpperCase()).join('');
  const clean = title.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (initials.length >= 3 ? initials : clean.slice(0, 4) || 'PRD') + '-';
}

export function generateVariantSku(
  prefix: string,
  selections: readonly { axisName: string; valueDisplay: string }[],
): string {
  const parts = selections.map((s) =>
    s.valueDisplay
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4),
  );
  return `${prefix}${parts.join('-')}`;
}
