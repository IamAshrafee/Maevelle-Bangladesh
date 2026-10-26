import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChartContainer } from '../components/ui/chart';

describe('ChartContainer generated CSS', () => {
  it('rejects unsafe CSS values and identifiers', () => {
    const markup = renderToStaticMarkup(
      <ChartContainer
        id={'unsafe"]{color:red}'}
        config={{
          safe: { color: '#0d9488' },
          injected: { color: 'red; background: url(https://example.invalid)' },
          html: { color: '</style><script>alert(1)</script>' },
          'bad;key': { color: '#fff' },
        }}
      >
        <div />
      </ChartContainer>,
    );

    expect(markup).toContain('--color-safe: #0d9488');
    expect(markup).not.toContain('--color-injected');
    expect(markup).not.toContain('--color-html');
    expect(markup).not.toContain('--color-bad');
    expect(markup).not.toContain('background: url');
    expect(markup).toMatch(/data-chart="chart-[a-zA-Z0-9_-]+"/);
  });
});
