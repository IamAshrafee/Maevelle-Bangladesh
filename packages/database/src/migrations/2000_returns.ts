import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Commercial return cases and immutable reverse physical receipt evidence. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists returns;
    alter table inventory.inventory_transactions drop constraint inventory_transactions_transaction_type_check;
    alter table inventory.inventory_transactions add constraint inventory_transactions_transaction_type_check check (transaction_type in ('OPENING_BALANCE', 'ADJUSTMENT', 'CONDITION_CHANGE', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIPT', 'STOCKTAKE_ADJUSTMENT', 'FULFILLMENT_DISPATCH', 'INBOUND_RECEIPT', 'RETURN_RECEIPT'));

    create table returns.return_cases (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      return_number text not null, case_type text not null check (case_type in ('CUSTOMER_RETURN', 'RTO')),
      order_id uuid not null references orders.orders(id), customer_id uuid references customers.customers(id), delivery_id uuid references delivery.deliveries(id),
      case_status text not null default 'OPEN' check (case_status in ('OPEN', 'RESOLVED', 'CANCELLED')),
      authorization_status text not null default 'PENDING' check (authorization_status in ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED')),
      transport_status text not null default 'NOT_STARTED' check (transport_status in ('NOT_STARTED', 'EXPECTED', 'IN_TRANSIT', 'ARRIVED', 'LOST', 'CANCELLED')),
      receipt_status text not null default 'NOT_RECEIVED' check (receipt_status in ('NOT_RECEIVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'DISCREPANCY')),
      inspection_status text not null default 'PENDING' check (inspection_status in ('NOT_REQUIRED', 'PENDING', 'PARTIALLY_INSPECTED', 'COMPLETED')),
      commercial_resolution_status text not null default 'PENDING' check (commercial_resolution_status in ('PENDING', 'NO_REFUND_REQUIRED', 'REFUND_PENDING', 'REFUND_COMPLETED', 'OTHER_RESOLUTION')),
      reason_code text not null check (reason_code in ('CUSTOMER_CHANGED_MIND','WRONG_ITEM_SENT','WRONG_SIZE','DAMAGED_ON_ARRIVAL','DEFECTIVE','QUALITY_NOT_EXPECTED','DELIVERY_REFUSED','CUSTOMER_UNAVAILABLE','ADDRESS_ISSUE','COURIER_FAILURE','ORDER_CANCELLED_IN_TRANSIT','OTHER')),
      reason_text text, created_by_actor_id uuid, authorized_by_actor_id uuid, created_at timestamptz not null default now(), authorized_at timestamptz, updated_at timestamptz not null default now(), version bigint not null default 1,
      unique (organization_id, return_number), unique (organization_id, id),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id),
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, delivery_id) references delivery.deliveries(organization_id, id),
      check ((case_type = 'RTO' and delivery_id is not null and authorization_status = 'NOT_REQUIRED') or (case_type = 'CUSTOMER_RETURN' and delivery_id is null))
    );
    create index return_cases_queue on returns.return_cases (organization_id, case_type, case_status, created_at desc);
    create table returns.return_lines (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), return_case_id uuid not null references returns.return_cases(id),
      order_line_id uuid not null references orders.order_lines(id), fulfillment_line_id uuid references fulfillment.fulfillment_lines(id), delivery_line_id uuid references delivery.delivery_lines(id),
      requested_quantity numeric(20,6) not null check (requested_quantity > 0), authorized_quantity numeric(20,6) not null default 0 check (authorized_quantity >= 0), received_quantity numeric(20,6) not null default 0 check (received_quantity >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique (organization_id, id), unique (return_case_id, order_line_id, fulfillment_line_id), check (authorized_quantity <= requested_quantity), check (received_quantity <= authorized_quantity),
      foreign key (organization_id, return_case_id) references returns.return_cases(organization_id, id)
    );
    create index return_lines_order on returns.return_lines (organization_id, order_line_id);
    create table returns.return_receipts (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), return_case_id uuid not null references returns.return_cases(id), receipt_number text not null, receiving_location_id uuid not null references warehouse.locations(id), status text not null default 'POSTED' check (status = 'POSTED'), posted_inventory_transaction_id uuid unique references inventory.inventory_transactions(id), created_by_actor_id uuid, posted_at timestamptz not null default now(), created_at timestamptz not null default now(), unique (organization_id, receipt_number), unique (organization_id, id), foreign key (organization_id, return_case_id) references returns.return_cases(organization_id, id), foreign key (organization_id, receiving_location_id) references warehouse.locations(organization_id, id)
    );
    create table returns.return_receipt_lines (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), return_receipt_id uuid not null references returns.return_receipts(id), return_line_id uuid not null references returns.return_lines(id), inventory_item_id uuid not null references inventory.inventory_items(id), condition_code text not null check (condition_code in ('SELLABLE','DAMAGED','QUARANTINE','INSPECTION')), quantity numeric(20,6) not null check (quantity > 0), created_at timestamptz not null default now(), unique (organization_id, id), foreign key (organization_id, return_receipt_id) references returns.return_receipts(organization_id, id), foreign key (organization_id, return_line_id) references returns.return_lines(organization_id, id), foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id)
    );
    create index return_receipt_lines_return_line on returns.return_receipt_lines (organization_id, return_line_id);
    create table returns.return_refund_links (id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), return_case_id uuid not null references returns.return_cases(id), refund_id uuid not null unique references payments.refunds(id), created_at timestamptz not null default now(), unique (organization_id, return_case_id, refund_id), foreign key (organization_id, return_case_id) references returns.return_cases(organization_id, id));

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('returns.view', 'returns', 'View customer returns and RTO operational history.', 'INTERNAL'),
      ('returns.manage', 'returns', 'Create, authorize, and manage reverse logistics cases.', 'HIGH'),
      ('returns.receive', 'returns', 'Post immutable physical reverse receipts.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code from iam.organization_memberships membership cross join (values ('returns.view'),('returns.manage'),('returns.receive')) as capability(capability_code) where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE' on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Return cases and receipts are immutable operational history.');
}
