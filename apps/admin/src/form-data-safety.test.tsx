import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { MoneyField, sanitizeMoneyInput } from '../components/ui/money-field';
import {
  useFormDialogLifecycle,
  type UseFormDialogLifecycleOptions,
  type UseFormDialogLifecycleReturn,
} from '../hooks/use-form-dialog-lifecycle';

function renderHook(options: UseFormDialogLifecycleOptions): UseFormDialogLifecycleReturn {
  let captured: UseFormDialogLifecycleReturn | null = null;
  function TestRig() {
    captured = useFormDialogLifecycle(options);
    return null;
  }
  renderToStaticMarkup(<TestRig />);
  if (!captured) {
    throw new Error('Failed to capture hook state');
  }
  return captured;
}

describe('Phase 3: Form Data Safety & Lifecycle', () => {
  describe('MoneyField & sanitizeMoneyInput', () => {
    it('normalizes comma decimal separator to dot', () => {
      expect(sanitizeMoneyInput('1500,50')).toBe('1500.50');
      expect(sanitizeMoneyInput('0,75')).toBe('0.75');
      expect(sanitizeMoneyInput('1500,')).toBe('1500.');
    });

    it('correctly handles thousands and South Asian lakh grouping commas without converting to decimals', () => {
      expect(sanitizeMoneyInput('15,000')).toBe('15000');
      expect(sanitizeMoneyInput('1,50,000')).toBe('150000');
      expect(sanitizeMoneyInput('1,000,000')).toBe('1000000');
    });

    it('strips non-numeric characters and extra decimal dots', () => {
      expect(sanitizeMoneyInput('abc123def')).toBe('123');
      expect(sanitizeMoneyInput('৳ 15,000.50')).toBe('15000.50');
      // Default maxDecimals is 2, so extra decimal parts are combined and truncated to 2 decimal places
      expect(sanitizeMoneyInput('12.34.56')).toBe('12.34');
      // When maxDecimals is 4, all decimal digits are preserved
      expect(sanitizeMoneyInput('12.34.56', true, 4)).toBe('12.3456');
    });

    it('enforces max decimals without float math corruption', () => {
      expect(sanitizeMoneyInput('100.999', true, 2)).toBe('100.99');
      expect(sanitizeMoneyInput('50.1234', true, 3)).toBe('50.123');
    });

    it('handles blank intermediate typing state without snapping to NaN or 0', () => {
      expect(sanitizeMoneyInput('')).toBe('');
      expect(sanitizeMoneyInput(' ')).toBe('');
    });

    it('renders accessible MoneyField markup with currency symbol and tabular numbers', () => {
      const html = renderToStaticMarkup(
        <MoneyField
          id="test-balance"
          label="Opening balance"
          value="1500"
          onChange={() => {}}
          currencySymbol="৳"
          description="Starting funds in BDT."
        />,
      );

      expect(html).toContain('Opening balance');
      expect(html).toContain('৳');
      expect(html).toContain('font-mono');
      expect(html).toContain('tabular-nums');
      expect(html.toLowerCase()).toContain('inputmode="decimal"');
      expect(html).toContain('Starting funds in BDT.');
    });

    it('associates validation errors with aria-invalid and aria-describedby', () => {
      const html = renderToStaticMarkup(
        <MoneyField
          id="test-error"
          label="Amount"
          value="invalid"
          onChange={() => {}}
          error="Must be a valid decimal."
        />,
      );

      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('aria-describedby="test-error-error"');
      expect(html).toContain('Must be a valid decimal.');
    });
  });

  describe('useFormDialogLifecycle Hook Behavior', () => {
    it('allows dismissal when form is clean', () => {
      const onClose = vi.fn();
      const cancelFn = vi.fn();
      const mockDetails = { cancel: cancelFn } as any;

      const lifecycle = renderHook({ isDirty: false, onClose });
      lifecycle.handleOpenChange(false, mockDetails);

      expect(cancelFn).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('intercepts close via details.cancel() when form is dirty', () => {
      const onClose = vi.fn();
      const cancelFn = vi.fn();
      const mockDetails = { cancel: cancelFn } as any;

      const lifecycle = renderHook({ isDirty: true, onClose });
      lifecycle.handleOpenChange(false, mockDetails);

      expect(cancelFn).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();

      // Explicitly confirming discard should invoke onClose
      lifecycle.handleConfirmDiscard();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('intercepts close via details.cancel() when in-flight submission is active', () => {
      const onClose = vi.fn();
      const cancelFn = vi.fn();
      const mockDetails = { cancel: cancelFn } as any;

      const lifecycle = renderHook({
        isDirty: false,
        isSubmitting: true,
        onClose,
      });

      lifecycle.handleOpenChange(false, mockDetails);
      expect(cancelFn).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('supports onOpenChange callback directly for open and clean close', () => {
      const onOpenChange = vi.fn();
      const cancelFn = vi.fn();
      const mockDetails = { cancel: cancelFn } as any;

      const lifecycle = renderHook({ isDirty: false, onOpenChange });
      lifecycle.handleOpenChange(true, mockDetails);
      expect(onOpenChange).toHaveBeenCalledWith(true);

      lifecycle.handleOpenChange(false, mockDetails);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('configures discard confirmation with custom title and description', () => {
      const lifecycle = renderHook({
        isDirty: true,
        title: 'Discard draft PO?',
        description: 'Draft purchase order lines will be discarded.',
      });

      const dialog = lifecycle.discardConfirmDialog as React.ReactElement<{
        children: React.ReactElement<{
          children: [
            React.ReactElement<{
              children: [
                React.ReactElement<{ children: string }>,
                React.ReactElement<{ children: string }>,
              ];
            }>,
          ];
        }>;
      }>;
      const content = dialog.props.children;
      const header = content.props.children[0];
      const [titleElement, descElement] = header.props.children;

      expect(titleElement.props.children).toBe('Discard draft PO?');
      expect(descElement.props.children).toBe('Draft purchase order lines will be discarded.');
    });
  });
});
