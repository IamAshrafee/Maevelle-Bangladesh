import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Button } from '../components/ui/button';

function luminance(hex: string) {
  const channels = hex
    .match(/[a-f0-9]{2}/gi)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function ratio(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1]! + 0.05) / (values[0]! + 0.05);
}
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
function token(block: string, name: string) {
  const value = block.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})`, 'i'))?.[1];
  if (!value) throw new Error('Missing semantic token');
  return value;
}
describe('Admin primary action contrast', () => {
  it('meets normal-text contrast in default/hover states for both themes', () => {
    const [light, dark] = css.split('.dark {');
    expect(ratio(token(light!, 'primary'), token(light!, 'foreground'))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      ratio(token(light!, 'primary-hover'), token(light!, 'primary-foreground')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratio(token(dark!, 'primary'), token(dark!, 'primary-foreground')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratio(token(dark!, 'primary-hover'), token(dark!, 'primary-foreground')),
    ).toBeGreaterThanOrEqual(4.5);
    const markup = renderToStaticMarkup(<Button>Apply date range</Button>);
    expect(markup).toContain('dark:text-primary-foreground');
    expect(markup).toContain('hover:text-primary-foreground');
  });
});
