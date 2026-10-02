import { describe, expect, it } from 'vitest';
import { listTransactionalEmailTemplates, renderTransactionalEmail } from './email-templates.js';

describe('transactional email templates', () => {
  it('renders HTML and text while escaping customer-controlled values', () => {
    const rendered = renderTransactionalEmail('order-confirmed', {
      customerName: '<script>alert(1)</script>',
      orderNumber: 'MV-1001',
      currencyCode: 'BDT',
      totalAmount: '1290.00',
      deliveryAddress: '<b>Unsafe</b>',
      trackingUrl: 'https://shop.example.test/orders/track',
      supportEmail: 'support@example.test',
      items: [{ title: '<img src=x>', quantity: '1', amount: '1290.00' }],
    });

    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).toContain('&lt;img src=x&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.text).toContain('MV-1001');
    expect(rendered.text).toContain('https://shop.example.test/orders/track');
  });

  it('registers every initial production template with a version', () => {
    expect(listTransactionalEmailTemplates().map((template) => template.key)).toEqual([
      'order-received',
      'order-confirmed',
      'payment-confirmed',
      'order-shipped',
      'order-delivered',
      'order-cancelled',
      'refund-completed',
    ]);
    expect(listTransactionalEmailTemplates().every((template) => template.version === 1)).toBe(true);
  });
});
