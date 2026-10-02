export type TransactionalEmailTemplateKey =
  | 'order-received'
  | 'order-confirmed'
  | 'payment-confirmed'
  | 'order-shipped'
  | 'order-delivered'
  | 'order-cancelled'
  | 'refund-completed';

export interface TransactionalEmailModel {
  readonly customerName: string;
  readonly orderNumber: string;
  readonly currencyCode: string;
  readonly totalAmount: string;
  readonly deliveryAddress?: string;
  readonly trackingUrl: string;
  readonly supportEmail: string;
  readonly environmentLabel?: string;
  readonly items?: readonly {
    readonly title: string;
    readonly variant?: string;
    readonly quantity: string;
    readonly amount: string;
  }[];
}

export interface RenderedTransactionalEmail {
  readonly templateKey: TransactionalEmailTemplateKey;
  readonly templateVersion: number;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const version = 1;

const copy: Record<
  TransactionalEmailTemplateKey,
  { readonly subject: string; readonly heading: string; readonly message: string; readonly cta: string }
> = {
  'order-received': {
    subject: 'We received order {{orderNumber}}',
    heading: 'Thank you for your order',
    message: 'We have received your order and will let you know when it is confirmed.',
    cta: 'Track order',
  },
  'order-confirmed': {
    subject: 'Order {{orderNumber}} is confirmed',
    heading: 'Your order is confirmed',
    message: 'We are preparing your order for delivery.',
    cta: 'View order status',
  },
  'payment-confirmed': {
    subject: 'Payment confirmed for order {{orderNumber}}',
    heading: 'Your payment is confirmed',
    message: 'We have recorded your payment successfully.',
    cta: 'View order status',
  },
  'order-shipped': {
    subject: 'Order {{orderNumber}} is on the way',
    heading: 'Your order has been handed to delivery',
    message: 'Your parcel is moving through the delivery network.',
    cta: 'Track delivery',
  },
  'order-delivered': {
    subject: 'Order {{orderNumber}} was delivered',
    heading: 'Your order has been delivered',
    message: 'We hope you love your Maevelle order.',
    cta: 'View order',
  },
  'order-cancelled': {
    subject: 'Order {{orderNumber}} was cancelled',
    heading: 'Your order was cancelled',
    message: 'This order is no longer being prepared. Any applicable refund is handled separately.',
    cta: 'View order status',
  },
  'refund-completed': {
    subject: 'Refund completed for order {{orderNumber}}',
    heading: 'Your refund is complete',
    message: 'Maevelle has completed the refund recorded for this order.',
    cta: 'View order status',
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function subject(template: string, orderNumber: string): string {
  return template.replace('{{orderNumber}}', orderNumber);
}

export function listTransactionalEmailTemplates() {
  return (Object.keys(copy) as TransactionalEmailTemplateKey[]).map((key) => ({
    key,
    version,
    subject: copy[key].subject,
    description: copy[key].message,
  }));
}

export function renderTransactionalEmail(
  templateKey: TransactionalEmailTemplateKey,
  model: TransactionalEmailModel,
): RenderedTransactionalEmail {
  const template = copy[templateKey];
  const safeName = escapeHtml(model.customerName || 'Customer');
  const safeOrder = escapeHtml(model.orderNumber);
  const safeTotal = escapeHtml(`${model.currencyCode} ${model.totalAmount}`);
  const safeTrackingUrl = escapeHtml(model.trackingUrl);
  const safeSupport = escapeHtml(model.supportEmail);
  const environmentBanner = model.environmentLabel
    ? `<tr><td style="padding:10px 24px;background:#fff3cd;color:#664d03;font:600 13px Arial,sans-serif">${escapeHtml(model.environmentLabel)} EMAIL · Intended for testing only</td></tr>`
    : '';
  const itemRows = (model.items ?? [])
    .map(
      (item) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee"><strong>${escapeHtml(item.title)}</strong>${item.variant ? `<br><span style="color:#666">${escapeHtml(item.variant)}</span>` : ''}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:center">${escapeHtml(item.quantity)}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escapeHtml(`${model.currencyCode} ${item.amount}`)}</td></tr>`,
    )
    .join('');
  const address = model.deliveryAddress
    ? `<p style="margin:20px 0 0;color:#444"><strong>Delivery address</strong><br>${escapeHtml(model.deliveryAddress)}</p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;color:#25211d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e8e1d8;border-radius:12px;overflow:hidden">${environmentBanner}<tr><td style="padding:28px 32px 12px;font:700 22px Georgia,serif;color:#6d1f36">Maevelle</td></tr><tr><td style="padding:8px 32px 32px;font:16px/1.55 Arial,sans-serif"><p>Hello ${safeName},</p><h1 style="font:700 28px/1.2 Georgia,serif;margin:18px 0">${escapeHtml(template.heading)}</h1><p>${escapeHtml(template.message)}</p><table role="presentation" width="100%" style="margin:24px 0;border-collapse:collapse"><tr><td><strong>Order</strong><br>${safeOrder}</td><td style="text-align:right"><strong>Total</strong><br>${safeTotal}</td></tr>${itemRows ? `<tr><td colspan="2"><table role="presentation" width="100%" style="margin-top:16px;border-collapse:collapse">${itemRows}</table></td></tr>` : ''}</table>${address}<p style="margin:28px 0"><a href="${safeTrackingUrl}" style="display:inline-block;background:#6d1f36;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">${escapeHtml(template.cta)}</a></p><p style="color:#555">Need help with your order? Reply to this email or contact <a href="mailto:${safeSupport}">${safeSupport}</a>.</p></td></tr><tr><td style="padding:20px 32px;background:#f8f5f1;color:#706860;font:13px/1.5 Arial,sans-serif">This is a transactional message about order ${safeOrder}.</td></tr></table></td></tr></table></body></html>`;
  const itemText = (model.items ?? [])
    .map((item) => `- ${item.title}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity}: ${model.currencyCode} ${item.amount}`)
    .join('\n');
  const text = [
    model.environmentLabel ? `${model.environmentLabel} EMAIL - Intended for testing only` : '',
    `Hello ${model.customerName || 'Customer'},`,
    template.heading,
    template.message,
    `Order: ${model.orderNumber}`,
    `Total: ${model.currencyCode} ${model.totalAmount}`,
    itemText,
    model.deliveryAddress ? `Delivery address: ${model.deliveryAddress}` : '',
    `${template.cta}: ${model.trackingUrl}`,
    `Need help? Reply to this email or contact ${model.supportEmail}.`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    templateKey,
    templateVersion: version,
    subject: subject(template.subject, model.orderNumber),
    html,
    text,
  };
}
