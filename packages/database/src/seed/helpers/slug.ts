const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Converts human text into a normalized database slug/handle.
 * Replaces non-alphanumeric characters with hyphens, collapses consecutive hyphens,
 * and strips leading/trailing hyphens.
 */
export function slugify(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[&]/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  if (!normalized) {
    throw new Error(`Cannot generate valid slug from input: "${input}"`);
  }

  if (!SLUG_REGEX.test(normalized)) {
    throw new Error(
      `Generated slug "${normalized}" from "${input}" does not satisfy regex /^[a-z0-9]+(?:-[a-z0-9]+)*$/`,
    );
  }

  return normalized;
}

/**
 * Validates whether a handle conforms to the project's slug constraint.
 */
export function isValidSlug(handle: string): boolean {
  return SLUG_REGEX.test(handle);
}
