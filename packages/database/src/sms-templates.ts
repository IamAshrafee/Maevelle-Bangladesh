import { estimateSmsLength } from './sms.js';

export type TransactionalSmsTemplateKey =
  | 'order-received'
  | 'order-confirmed'
  | 'payment-confirmed'
  | 'order-shipped'
  | 'order-delivered'
  | 'order-cancelled'
  | 'refund-completed';

export interface TransactionalSmsModel {
  readonly customerName?: string;
  readonly orderNumber: string;
  readonly currencyCode: string;
  readonly totalAmount: string;
  readonly trackingUrl?: string;
}

const definitions: Readonly<Record<TransactionalSmsTemplateKey, {
  readonly version: number;
  readonly event: string;
  readonly description: string;
  readonly render: (model: TransactionalSmsModel) => string;
}>> = {
  'order-received': { version: 1, event: 'ORDER_PLACED', description: 'Confirms Maevelle received the order.', render: (m) => `Maevelle: Order ${m.orderNumber} received. Total ${m.currencyCode} ${m.totalAmount}. We will confirm it shortly.` },
  'order-confirmed': { version: 1, event: 'ORDER_CONFIRMED', description: 'Confirms the order is approved for preparation.', render: (m) => `Maevelle: Order ${m.orderNumber} confirmed. Total ${m.currencyCode} ${m.totalAmount}.${m.customerName ? ` Customer: ${m.customerName}.` : ''}${track(m)}` },
  'payment-confirmed': { version: 1, event: 'PAYMENT_VERIFIED', description: 'Confirms verified payment.', render: (m) => `Maevelle: Payment confirmed for order ${m.orderNumber}. Amount ${m.currencyCode} ${m.totalAmount}.` },
  'order-shipped': { version: 1, event: 'ORDER_DISPATCHED', description: 'Confirms authoritative fulfillment dispatch.', render: (m) => `Maevelle: Order ${m.orderNumber} has been dispatched.${track(m)}` },
  'order-delivered': { version: 1, event: 'DELIVERY_COMPLETED', description: 'Confirms authoritative delivery completion.', render: (m) => `Maevelle: Order ${m.orderNumber} was delivered. Thank you for shopping with us.` },
  'order-cancelled': { version: 1, event: 'ORDER_CANCELLED', description: 'Confirms order cancellation.', render: (m) => `Maevelle: Order ${m.orderNumber} has been cancelled. Contact support if you need help.` },
  'refund-completed': { version: 1, event: 'REFUND_COMPLETED', description: 'Confirms completed refund processing.', render: (m) => `Maevelle: Refund completed for order ${m.orderNumber}. Please allow your payment provider's processing time.` },
};

function track(model: TransactionalSmsModel): string {
  return model.trackingUrl ? ` Track: ${model.trackingUrl}` : '';
}

export function listTransactionalSmsTemplates() {
  return Object.entries(definitions).map(([key, definition]) => ({
    key: key as TransactionalSmsTemplateKey,
    version: definition.version,
    event: definition.event,
    description: definition.description,
  }));
}

export function renderTransactionalSms(key: TransactionalSmsTemplateKey, model: TransactionalSmsModel) {
  const definition = definitions[key];
  const renderedText = definition.render(model).trim();
  return {
    templateKey: key,
    templateVersion: definition.version,
    event: definition.event,
    renderedText,
    ...estimateSmsLength(renderedText),
  };
}
