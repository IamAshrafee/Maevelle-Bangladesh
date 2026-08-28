export type CostingScreen = 'landed-cost' | 'costing';
export type CostingNotice = { tone: 'error' | 'success'; message: string } | undefined;
export interface Shipment {
  id: string;
  shipmentNumber: string;
  receivingLocationName: string;
  status: string;
  allocations: readonly {
    id: string;
    purchaseNumber: string;
    supplierName: string;
    sku: string;
    productTitle: string;
    allocatedQuantity: string;
    receivedQuantity: string;
  }[];
}
export interface Worksheet {
  id: string;
  shipment_id: string;
  worksheet_number: string;
  base_currency_code: string;
  status: string;
  current_revision_id: string | null;
  finalized_at: string | null;
  revisions: readonly {
    id: string;
    revision_number: string;
    revision_kind: string;
    status: string;
    created_at: string;
    finalized_at: string | null;
    total_effect: string;
  }[];
  components: readonly {
    id: string;
    cost_type: string;
    original_amount: string;
    original_currency_code: string;
    value_status: string;
    allocation_method: string;
    fx_rate: string | null;
    fx_rate_recorded_at: string | null;
    fx_source: string | null;
    reference: string | null;
  }[];
  results: readonly {
    allocation_target_id: string;
    purchase_cost: string;
    additional_cost: string;
    total_acquisition_cost: string;
    unit_acquisition_cost: string;
    currency_code: string;
    sku: string;
    product_title: string;
    quantity: string;
  }[];
}
export interface Layer {
  id: string;
  remaining_quantity: string;
  original_quantity: string;
  effective_cost: string;
  currency_code: string;
  location_name: string;
  condition_code: string;
  product_title: string;
  sku: string;
  receipt_number: string;
  received_at: string;
  cost_state: string;
}
export interface Assignment {
  id: string;
  fulfillment_id: string;
  status: string;
  total_cost: string;
  currency_code: string;
  quantity: string;
  order_number: string;
  product_title: string;
  sku: string;
  created_at: string;
}
export interface Cogs {
  id: string;
  delivery_id: string | null;
  fulfillment_id: string;
  order_number: string;
  total_cost: string;
  currency_code: string;
  created_at: string;
}
export interface Valuation {
  inventory_item_id: string;
  location_id: string;
  product_title: string;
  sku: string;
  location_name: string;
  condition_code: string;
  currency_code: string;
  quantity: string;
  value: string;
}
export interface Preview {
  components: readonly {
    id: string;
    allocations: readonly { shipmentAllocationId: string; amount: string }[];
  }[];
}

export type CostingTab = 'layers' | 'positions' | 'outbound' | 'cogs' | 'valuation';
