import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const theme = readFileSync(new URL('../../styles/theme.css', import.meta.url), 'utf8');

function token(name: string): string {
  const value = theme.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Missing hex color token: ${name}`);
  return value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('storefront design tokens', () => {
  it.each([
    ['foreground', 'background'],
    ['foreground-muted', 'background'],
    ['foreground-subtle', 'background'],
    ['primary-foreground', 'primary'],
    ['success-foreground', 'success-subtle'],
    ['warning-foreground', 'warning-subtle'],
    ['danger-foreground', 'danger-subtle'],
    ['info-foreground', 'info-subtle'],
  ])('%s on %s meets WCAG AA for normal text', (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  it('defines one canonical semantic primary', () => {
    expect(theme.match(/--color-primary:/g)).toHaveLength(1);
    expect(token('primary')).toBe('#7e0e35');
  });

  it('keeps motion and shape values canonical', () => {
    expect(theme).toContain('--motion-fast: 120ms');
    expect(theme).toContain('--motion-normal: 180ms');
    expect(theme).toContain('--radius-md: 0.5rem');
    expect(theme).toContain('--container-storefront: 77.5rem');
  });

  it('resolves Next font variables at the component use site', () => {
    expect(theme).toContain('@theme inline');
    expect(theme).toContain('--font-bangla:');
    expect(theme).toContain('var(--font-noto-bengali)');
  });
});
