import type { Migration, MigrationProvider } from 'kysely/migration';

import * as baseline from './0000_extensions_and_database_baseline.js';
import * as platform from './0001_platform_core.js';
import * as audit from './0002_audit_foundation.js';
import * as operations from './0003_platform_operations.js';
import * as iam from './0004_iam_and_authentication.js';
import * as emailNormalization from './0005_iam_user_normalization.js';
import * as catalog from './0200_catalog.js';
import * as sizing from './0300_sizing.js';
import * as media from './0400_media.js';
import * as warehouse from './0500_warehouse.js';
import * as inventory from './0600_inventory.js';
import * as inventoryStocktakeTimestamp from './0601_inventory_stocktake_session_timestamp.js';
import * as geography from './0650_geography.js';
import * as customers from './0700_customers.js';
import * as pricing from './0800_pricing.js';
import * as promotions from './0900_promotions.js';
import * as cart from './1000_cart.js';
import * as geographySourceCodeNulls from './1001_geography_source_code_nulls.js';
import * as ordersCheckoutCod from './1100_orders_checkout_cod.js';
import * as payments from './1200_payments.js';
import * as checkoutPaymentDefault from './1201_checkout_payment_default.js';
import * as refundAllocations from './1202_refund_allocations.js';
import * as fulfillment from './1300_fulfillment.js';
import * as delivery from './1400_delivery.js';
import * as procurement from './1500_procurement.js';
import * as inboundShipment from './1600_inbound_shipment.js';
import * as receiving from './1700_receiving.js';
import * as landedCost from './1800_landed_cost.js';
import * as costing from './1900_costing.js';
import * as costingAdjustmentEffects from './1901_costing_adjustment_effects.js';
import * as returns from './2000_returns.js';
import * as returnCostRecovery from './2100_return_cost_recovery.js';
import * as returnCostLayerProvenance from './2101_return_cost_layer_provenance.js';
import * as finance from './2200_finance.js';
import * as reviews from './2300_reviews.js';
import * as notificationsIntegrations from './2400_notifications_integrations.js';
import * as notificationsIntegrationsOperations from './2601_notifications_integrations_operations.js';
import * as analytics from './2500_analytics.js';
import * as analyticsReportingOperations from './2602_analytics_reporting_operations.js';
import * as adminOperations from './2600_admin_operations.js';
import * as adminOperationsComplete from './2603_admin_operations_complete.js';
import * as storefrontSearch from './2700_storefront_search.js';
import * as operationalControls from './2701_operational_controls.js';
import * as supplyOperations from './2800_supply_operations.js';

/**
 * The migration list is deliberately explicit. Migration files are reviewed
 * source, not a runtime schema-push mechanism or Better Auth auto-migration.
 */
export const migrations = {
  '0000_extensions_and_database_baseline': baseline,
  '0001_platform_core': platform,
  '0002_audit_foundation': audit,
  '0003_platform_operations': operations,
  '0004_iam_and_authentication': iam,
  '0005_iam_user_normalization': emailNormalization,
  '0200_catalog': catalog,
  '0300_sizing': sizing,
  '0400_media': media,
  '0500_warehouse': warehouse,
  '0600_inventory': inventory,
  '0601_inventory_stocktake_session_timestamp': inventoryStocktakeTimestamp,
  '0650_geography': geography,
  '0700_customers': customers,
  '0800_pricing': pricing,
  '0900_promotions': promotions,
  '1000_cart': cart,
  '1001_geography_source_code_nulls': geographySourceCodeNulls,
  '1100_orders_checkout_cod': ordersCheckoutCod,
  '1200_payments': payments,
  '1201_checkout_payment_default': checkoutPaymentDefault,
  '1202_refund_allocations': refundAllocations,
  '1300_fulfillment': fulfillment,
  '1400_delivery': delivery,
  '1500_procurement': procurement,
  '1600_inbound_shipment': inboundShipment,
  '1700_receiving': receiving,
  '1800_landed_cost': landedCost,
  '1900_costing': costing,
  '1901_costing_adjustment_effects': costingAdjustmentEffects,
  '2000_returns': returns,
  '2100_return_cost_recovery': returnCostRecovery,
  '2101_return_cost_layer_provenance': returnCostLayerProvenance,
  '2200_finance': finance,
  '2300_reviews': reviews,
  '2400_notifications_integrations': notificationsIntegrations,
  '2601_notifications_integrations_operations': notificationsIntegrationsOperations,
  '2500_analytics': analytics,
  '2602_analytics_reporting_operations': analyticsReportingOperations,
  '2600_admin_operations': adminOperations,
  '2603_admin_operations_complete': adminOperationsComplete,
  '2700_storefront_search': storefrontSearch,
  '2701_operational_controls': operationalControls,
  '2800_supply_operations': supplyOperations,
} satisfies Record<string, Migration>;

export const migrationProvider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  },
};
