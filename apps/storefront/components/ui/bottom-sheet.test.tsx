import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { BottomSheet } from './bottom-sheet';
import { SortDrawer } from '@/components/commerce/sort-drawer';
import { FilterDrawer } from '@/components/commerce/filter-drawer';

const themeCss = readFileSync(new URL('../../styles/theme.css', import.meta.url), 'utf8');

describe('Mobile Bottom Sheet — Premium Motion Specification', () => {
  describe('CSS Motion Tokens & Style Invariants', () => {
    it('defines the canonical 380ms decelerate entrance easing', () => {
      expect(themeCss).toContain('--duration-sheet-in: 380ms');
      expect(themeCss).toContain('--ease-sheet-in: cubic-bezier(0.22, 1, 0.36, 1)');
    });

    it('defines the canonical 280ms accelerate exit easing', () => {
      expect(themeCss).toContain('--duration-sheet-out: 280ms');
      expect(themeCss).toContain('--ease-sheet-out: cubic-bezier(0.4, 0, 1, 1)');
    });

    it('defines the decoupled subtle backdrop fade durations', () => {
      expect(themeCss).toContain('--duration-sheet-backdrop-in: 250ms');
      expect(themeCss).toContain('--duration-sheet-backdrop-out: 200ms');
    });

    it('provides GPU-accelerated translateY transitions for the rigid surface', () => {
      expect(themeCss).toContain('.bottom-sheet-surface {');
      expect(themeCss).toContain('transform: translateY(100%);');
      expect(themeCss).toContain(".bottom-sheet-surface[data-state='open'] {");
      expect(themeCss).toContain('transform: translateY(0%);');
      expect(themeCss).toContain('will-change: transform;');
    });

    it('decouples backdrop opacity without transform or translation', () => {
      expect(themeCss).toContain('.bottom-sheet-backdrop {');
      expect(themeCss).toContain('opacity: 0;');
      expect(themeCss).toContain(".bottom-sheet-backdrop[data-state='open'] {");
      expect(themeCss).toContain('opacity: 1;');
      expect(themeCss).not.toContain('.bottom-sheet-backdrop { transform:');
    });

    it('includes @starting-style for immediate zero-delay entrance in modern engines', () => {
      expect(themeCss).toContain('@starting-style {');
      expect(themeCss).toContain(
        ".bottom-sheet-surface[data-state='open'] {\n    transform: translateY(100%);\n  }",
      );
      expect(themeCss).toContain(
        ".bottom-sheet-backdrop[data-state='open'] {\n    opacity: 0;\n  }",
      );
    });

    it('respects prefers-reduced-motion without vertical transforms', () => {
      expect(themeCss).toContain('@media (prefers-reduced-motion: reduce) {');
      expect(themeCss).toContain('transform: none !important;');
      expect(themeCss).toContain(
        ".bottom-sheet-surface[data-state='closed'] {\n    opacity: 0 !important;\n    transform: none !important;\n  }",
      );
      expect(themeCss).toContain(
        ".bottom-sheet-surface[data-state='open'] {\n    opacity: 1 !important;\n    transform: none !important;\n  }",
      );
    });

    it('ensures safe-area padding utilities exist', () => {
      expect(themeCss).toContain('@utility pb-safe {');
      expect(themeCss).toContain('padding-bottom: env(safe-area-inset-bottom, 0px);');
    });
  });

  describe('Component Structure & SSR Behavior', () => {
    it('returns null on the server when closed', () => {
      const markup = renderToStaticMarkup(
        <BottomSheet isOpen={false} onClose={() => {}} title="Test Sheet">
          <p>Hidden Content</p>
        </BottomSheet>,
      );
      expect(markup).toBe('');
    });

    it('remains safe to render in SSR environments when isOpen is true', () => {
      // In server environments where document is undefined, returns null cleanly without throwing or mismatch
      const markup = renderToStaticMarkup(
        <BottomSheet isOpen={true} onClose={() => {}} title="Test Sheet">
          <p>Client Portal Content</p>
        </BottomSheet>,
      );
      expect(markup).toBe('');
    });

    it('safely renders SortDrawer when closed in SSR', () => {
      const markup = renderToStaticMarkup(
        <SortDrawer
          isOpen={false}
          onClose={() => {}}
          onSelectSort={() => {}}
          selectedSort="popular"
        />,
      );
      expect(markup).toBe('');
    });

    it('safely renders FilterDrawer when closed in SSR', () => {
      const markup = renderToStaticMarkup(
        <FilterDrawer isOpen={false} onApply={() => {}} onClose={() => {}} />,
      );
      expect(markup).toBe('');
    });
  });
});
