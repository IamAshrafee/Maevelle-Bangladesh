import { Type } from 'typebox';
import {
  conditionSchema,
  currencySchema,
  quantitySchema,
  supplierTypeSchema,
} from './common.js';

// Query schemas
export const listSuppliersQuerySchema = Type.Object({
  page: Type.Optional(Type.String()),
  pageSize: Type.Optional(Type.String()),
  search: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  supplierType: Type.Optional(Type.String()),
  countryCode: Type.Optional(Type.String()),
  sortBy: Type.Optional(
    Type.Union([
      Type.Literal('code'),
      Type.Literal('name'),
      Type.Literal('status'),
      Type.Literal('createdAt'),
    ]),
  ),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});

export const listPurchasesQuerySchema = Type.Object({
  page: Type.Optional(Type.String()),
  pageSize: Type.Optional(Type.String()),
  search: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  supplierId: Type.Optional(Type.String()),
  currencyCode: Type.Optional(currencySchema),
  destinationLocationId: Type.Optional(Type.String()),
  fromDate: Type.Optional(Type.String()),
  toDate: Type.Optional(Type.String()),
  sortBy: Type.Optional(
    Type.Union([
      Type.Literal('purchaseNumber'),
      Type.Literal('orderDate'),
      Type.Literal('expectedDate'),
      Type.Literal('createdAt'),
      Type.Literal('status'),
    ]),
  ),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});

export const listShipmentsQuerySchema = Type.Object({
  page: Type.Optional(Type.String()),
  pageSize: Type.Optional(Type.String()),
  search: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  receivingStatus: Type.Optional(Type.String()),
  purchaseId: Type.Optional(Type.String()),
  receivingLocationId: Type.Optional(Type.String()),
  transportMode: Type.Optional(Type.String()),
  sortBy: Type.Optional(
    Type.Union([
      Type.Literal('shipmentNumber'),
      Type.Literal('expectedArrivalDate'),
      Type.Literal('createdAt'),
      Type.Literal('status'),
    ]),
  ),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});

export const listReceiptsQuerySchema = Type.Object({
  page: Type.Optional(Type.String()),
  pageSize: Type.Optional(Type.String()),
  search: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  shipmentId: Type.Optional(Type.String()),
  locationId: Type.Optional(Type.String()),
  fromDate: Type.Optional(Type.String()),
  toDate: Type.Optional(Type.String()),
  sortBy: Type.Optional(
    Type.Union([
      Type.Literal('receiptNumber'),
      Type.Literal('postedAt'),
      Type.Literal('createdAt'),
    ]),
  ),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});

// Supplier body schemas
export const createSupplierBodySchema = Type.Object({
  code: Type.Optional(Type.String()),
  name: Type.String({ minLength: 1 }),
  contactName: Type.Optional(Type.String()),
  contactEmail: Type.Optional(Type.String()),
  contactPhone: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  supplierType: Type.Optional(supplierTypeSchema),
  countryCode: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
  preferredCurrencyCode: Type.Optional(currencySchema),
  paymentTerms: Type.Optional(Type.String()),
  leadTimeDays: Type.Optional(Type.Integer({ minimum: 0 })),
  websiteUrl: Type.Optional(Type.String()),
});

export const updateSupplierBodySchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  name: Type.Optional(Type.String({ minLength: 1 })),
  status: Type.Optional(
    Type.Union([
      Type.Literal('ACTIVE'),
      Type.Literal('INACTIVE'),
      Type.Literal('BLOCKED'),
      Type.Literal('ARCHIVED'),
    ]),
  ),
  supplierType: Type.Optional(supplierTypeSchema),
  countryCode: Type.Optional(
    Type.Union([Type.String({ minLength: 2, maxLength: 2 }), Type.Null()]),
  ),
  preferredCurrencyCode: Type.Optional(Type.Union([currencySchema, Type.Null()])),
  paymentTerms: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  leadTimeDays: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
  websiteUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  contactName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  contactEmail: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  contactPhone: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export const versionBodySchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
});

// Purchase body schemas
export const createPurchaseBodySchema = Type.Object({
  supplierId: Type.String({ minLength: 1 }),
  currencyCode: currencySchema,
  notes: Type.Optional(Type.String()),
  supplierReference: Type.Optional(Type.String()),
  orderDate: Type.Optional(Type.String({ format: 'date' })),
  expectedDate: Type.Optional(Type.String({ format: 'date' })),
  destinationLocationId: Type.Optional(Type.String()),
  lines: Type.Optional(
    Type.Array(
      Type.Object({
        variantId: Type.String({ minLength: 1 }),
        quantity: quantitySchema,
        unitPrice: Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' }),
      }),
    ),
  ),
});

export const updatePurchaseBodySchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  supplierId: Type.Optional(Type.String({ minLength: 1 })),
  currencyCode: Type.Optional(currencySchema),
  notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  supplierReference: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  orderDate: Type.Optional(Type.String({ format: 'date' })),
  expectedDate: Type.Optional(Type.Union([Type.String({ format: 'date' }), Type.Null()])),
  destinationLocationId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export const addPurchaseLineBodySchema = Type.Object({
  variantId: Type.String({ minLength: 1 }),
  quantity: quantitySchema,
  unitPrice: Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' }),
});

export const updatePurchaseLineBodySchema = Type.Object({
  quantity: Type.Optional(quantitySchema),
  unitPrice: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
});

export const cancelPurchaseBodySchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  reason: Type.String({ minLength: 1 }),
});

export const closePurchaseBodySchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  reason: Type.Optional(Type.String()),
});

// Shipment body schemas
export const createShipmentBodySchema = Type.Object({
  receivingLocationId: Type.String({ minLength: 1 }),
  transportMode: Type.Union([
    Type.Literal('AIR'),
    Type.Literal('SEA'),
    Type.Literal('ROAD'),
    Type.Literal('RAIL'),
    Type.Literal('OTHER'),
  ]),
  originText: Type.Optional(Type.String()),
  trackingReference: Type.Optional(Type.String()),
  expectedArrivalDate: Type.Optional(Type.String({ format: 'date' })),
  allocations: Type.Array(
    Type.Object({ purchaseLineId: Type.String({ minLength: 1 }), quantity: quantitySchema }),
    { minItems: 1 },
  ),
});

export const updateShipmentBodySchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  trackingReference: Type.Optional(Type.String()),
  expectedArrivalDate: Type.Optional(Type.String({ format: 'date' })),
  originText: Type.Optional(Type.String()),
  transportMode: Type.Optional(
    Type.Union([
      Type.Literal('AIR'),
      Type.Literal('SEA'),
      Type.Literal('ROAD'),
      Type.Literal('RAIL'),
      Type.Literal('OTHER'),
    ]),
  ),
});

export const updateShipmentAllocationsBodySchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  allocations: Type.Array(
    Type.Object({ purchaseLineId: Type.String({ minLength: 1 }), quantity: quantitySchema }),
    { minItems: 1 },
  ),
});

export const cancelShipmentBodySchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  reason: Type.String({ minLength: 1 }),
});

// Receiving body schemas
export const postInboundReceiptBodySchema = Type.Object({
  lines: Type.Array(
    Type.Object({
      shipmentAllocationId: Type.String({ minLength: 1 }),
      condition: conditionSchema,
      quantity: quantitySchema,
    }),
    { minItems: 1 },
  ),
  packingSlipReference: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
});

export const reverseInboundReceiptBodySchema = Type.Object({
  reason: Type.String({ minLength: 1 }),
});

export const resolveConditionBodySchema = Type.Object({
  lineId: Type.String({ minLength: 1 }),
  targetCondition: Type.Union([Type.Literal('SELLABLE'), Type.Literal('DAMAGED')]),
  quantity: quantitySchema,
  reason: Type.Optional(Type.String()),
});
