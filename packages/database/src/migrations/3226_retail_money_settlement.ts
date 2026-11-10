import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>) {
  await sql`
    alter table orders.orders add column rounding_adjustment numeric(20,4) not null default 0,
      add column payment_fee_amount numeric(20,4) not null default 0 check(payment_fee_amount>=0),
      add column commercial_policy_snapshot jsonb;
    alter table orders.orders drop constraint orders_tax_amount_check;
    alter table orders.orders add constraint orders_tax_amount_check check(tax_amount>=0);
    alter table orders.orders drop constraint orders_check;
    alter table orders.orders add constraint orders_commercial_total_check
      check(total_amount=subtotal_amount-discount_amount+delivery_amount+tax_amount+payment_fee_amount+rounding_adjustment);
    alter table orders.orders add constraint orders_whole_policy_check check(commercial_policy_snapshot is null or
      (currency_code='BDT' and mod(total_amount,1)=0 and abs(rounding_adjustment)<=0.5));
    create function orders.retain_whole_taka_terms() returns trigger language plpgsql as $$
    begin
      if old.commercial_policy_snapshot is not null and
        (old.subtotal_amount,old.discount_amount,old.delivery_amount,old.tax_amount,old.payment_fee_amount,
         old.rounding_adjustment,old.total_amount,old.currency_code,old.commercial_policy_snapshot)
        is distinct from
        (new.subtotal_amount,new.discount_amount,new.delivery_amount,new.tax_amount,new.payment_fee_amount,
         new.rounding_adjustment,new.total_amount,new.currency_code,new.commercial_policy_snapshot) then
        raise exception 'Whole-taka commercial terms require append-only correction' using errcode='23514';
      end if; return new;
    end $$;
    create trigger retain_whole_taka_terms before update on orders.orders
      for each row execute function orders.retain_whole_taka_terms();
    alter table analytics.order_facts add column tax_amount numeric(20,4) not null default 0,
      add column payment_fee_amount numeric(20,4) not null default 0,
      add column rounding_adjustment numeric(20,4) not null default 0;
    alter table analytics.order_facts drop constraint order_facts_check;
    alter table analytics.order_facts add constraint order_facts_check check
      (order_total_amount=merchandise_gross_amount-discount_amount+delivery_charge_amount+tax_amount+payment_fee_amount+rounding_adjustment);
    alter table finance.finance_transactions drop constraint finance_transactions_transaction_type_check;
    alter table finance.finance_transactions add constraint finance_transactions_transaction_type_check check(transaction_type in
      ('OPENING_BALANCE','EXPENSE_PAYMENT','INTERNAL_TRANSFER','EXTERNAL_ADJUSTMENT','PAYMENT_SOURCE_POSTING',
       'REFUND_SOURCE_POSTING','COD_SETTLEMENT','CAPITAL_CONTRIBUTION','OWNER_FUNDED_EXPENSE','CAPITAL_WITHDRAWAL',
       'CAPITAL_REVERSAL','ASSET_SALE','CUSTOMER_BALANCE_WAIVER','CUSTOMER_BALANCE_WAIVER_REVERSAL'));
    create table payments.cash_policy_proposals (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      definition jsonb not null check(jsonb_typeof(definition)='object'),
      created_by uuid not null references iam.users(id),created_at timestamptz not null default clock_timestamp(),unique(organization_id,id)
    );
    create table payments.cash_policy_revisions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      proposal_id uuid not null unique,revision text not null check(length(revision) between 1 and 64),
      scope text not null check(scope in ('SYNTHETIC','BUSINESS')),
      maximum_per_adjustment numeric(20,4) not null check(maximum_per_adjustment>0 and mod(maximum_per_adjustment,1)=0),
      maximum_per_order numeric(20,4) not null check(maximum_per_order>=maximum_per_adjustment),
      maximum_per_staff_day numeric(20,4) not null check(maximum_per_staff_day>=maximum_per_adjustment),
      self_approval_limit numeric(20,4) not null check(self_approval_limit>=0 and self_approval_limit<=maximum_per_adjustment),
      allowed_order_states text[] not null check(cardinality(allowed_order_states)>0 and allowed_order_states <@ array['PENDING','CONFIRMED','COMPLETED']::text[]),
      effective_from timestamptz not null,expires_at timestamptz not null check(expires_at>effective_from),
      accounting_reference text not null check(length(trim(accounting_reference)) between 1 and 512),
      invoice_reference text not null check(length(trim(invoice_reference)) between 1 and 512),
      courier_reference text not null check(length(trim(courier_reference)) between 1 and 512),
      approved_by uuid not null references iam.users(id),approval_reference text not null check(length(trim(approval_reference)) between 1 and 512),
      created_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,revision),
      foreign key(organization_id,proposal_id) references payments.cash_policy_proposals(organization_id,id)
    );
    create table payments.cash_shortfall_requests (
      id uuid primary key default uuidv7(),organization_id uuid not null references platform.organizations(id),
      order_id uuid not null,payment_id uuid not null,policy_id uuid not null,
      amount numeric(20,4) not null check(amount>0 and mod(amount,1)=0),
      requested_by uuid not null references iam.users(id),
      reason text not null check(length(trim(reason)) between 1 and 512),
      collection_evidence_reference text not null check(length(trim(collection_evidence_reference)) between 1 and 512),
      created_at timestamptz not null default clock_timestamp(),unique(organization_id,id),
      foreign key(organization_id,order_id) references orders.orders(organization_id,id),
      foreign key(organization_id,payment_id) references payments.payments(organization_id,id),
      foreign key(organization_id,policy_id) references payments.cash_policy_revisions(organization_id,id)
    );
    create index cash_requests_order on payments.cash_shortfall_requests(organization_id,order_id,created_at desc,id);
    create index cash_requests_payment on payments.cash_shortfall_requests(organization_id,payment_id);
    create index cash_requests_policy on payments.cash_shortfall_requests(organization_id,policy_id);
    create index cash_requests_staff on payments.cash_shortfall_requests(organization_id,requested_by,created_at,id);
    create table payments.cash_shortfall_adjustments (
      id uuid primary key,organization_id uuid not null references platform.organizations(id),
      approved_by uuid not null references iam.users(id),
      finance_transaction_id uuid not null unique,
      created_at timestamptz not null default clock_timestamp(),unique(organization_id,id),
      foreign key(organization_id,id) references payments.cash_shortfall_requests(organization_id,id),
      foreign key(organization_id,finance_transaction_id) references finance.finance_transactions(organization_id,id)
    );
    create table payments.cash_shortfall_reversals (
      id uuid primary key default uuidv7(),organization_id uuid not null references platform.organizations(id),
      adjustment_id uuid not null unique,actor_id uuid not null references iam.users(id),
      reason text not null check(length(trim(reason)) between 1 and 512),
      evidence_reference text not null check(length(trim(evidence_reference)) between 1 and 512),
      finance_transaction_id uuid not null unique,created_at timestamptz not null default clock_timestamp(),
      foreign key(organization_id,adjustment_id) references payments.cash_shortfall_adjustments(organization_id,id),
      foreign key(organization_id,finance_transaction_id) references finance.finance_transactions(organization_id,id)
    );
    create function payments.cash_waiver_total(org uuid,ord uuid) returns numeric language sql stable as $$
      select coalesce(sum(r.amount),0)::numeric(20,4) from payments.cash_shortfall_requests r
      join payments.cash_shortfall_adjustments a on a.organization_id=r.organization_id and a.id=r.id
      join payments.payments p on p.organization_id=r.organization_id and p.id=r.payment_id and p.status='CONFIRMED'
      where r.organization_id=org and r.order_id=ord and not exists
        (select 1 from payments.cash_shortfall_reversals x where x.organization_id=a.organization_id and x.adjustment_id=a.id)
    $$;
    create function payments.check_cash_adjustment() returns trigger language plpgsql as $$
    declare valid boolean;
    begin
      select r.amount<=policy.maximum_per_adjustment and new.created_at>=policy.effective_from and new.created_at<policy.expires_at and
        (new.approved_by<>r.requested_by or r.amount<=policy.self_approval_limit) and
        method.code='COD' and payment.status='CONFIRMED' and delivery.order_id=r.order_id and delivery.outcome_status='DELIVERED' and
        txn.transaction_type='CUSTOMER_BALANCE_WAIVER' and txn.source_domain='payments.cash_shortfall' and txn.source_id=r.id and
        not exists(select 1 from finance.financial_account_entries e where e.organization_id=new.organization_id and e.finance_transaction_id=txn.id) and
        (select coalesce(sum(a.amount),0) from payments.payment_allocations a join payments.payments p on p.organization_id=a.organization_id and p.id=a.payment_id
          where a.organization_id=r.organization_id and a.order_id=r.order_id and p.status='CONFIRMED')+
        payments.cash_waiver_total(r.organization_id,r.order_id)=intent.expected_amount
      into valid from payments.cash_shortfall_requests r
      join payments.cash_policy_revisions policy on policy.organization_id=r.organization_id and policy.id=r.policy_id
      join payments.payments payment on payment.organization_id=r.organization_id and payment.id=r.payment_id
      join payments.payment_methods method on method.organization_id=payment.organization_id and method.id=payment.payment_method_id
      join delivery.deliveries delivery on delivery.organization_id=payment.organization_id and delivery.id=payment.source_delivery_id
      join payments.payment_intents intent on intent.organization_id=r.organization_id and intent.order_id=r.order_id
      join finance.finance_transactions txn on txn.organization_id=new.organization_id and txn.id=new.finance_transaction_id
      where r.organization_id=new.organization_id and r.id=new.id;
      if valid is distinct from true then raise exception 'Cash waiver conservation or provenance failed' using errcode='23514';end if;
      return new;
    end $$;
    create constraint trigger cash_adjustment_conservation after insert on payments.cash_shortfall_adjustments
      deferrable initially deferred for each row execute function payments.check_cash_adjustment();
    create trigger immutable_cash_proposal before update or delete on payments.cash_policy_proposals
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_cash_policy before update or delete on payments.cash_policy_revisions
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_cash_request before update or delete on payments.cash_shortfall_requests
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_cash_adjustment before update or delete on payments.cash_shortfall_adjustments
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_cash_reversal before update or delete on payments.cash_shortfall_reversals
      for each row execute function payments.immutable_payment_evidence();
    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values
      ('payments.cash_adjustments.manage','payments','Request policy-qualified cash shortfall settlement.','RESTRICTED'),
      ('payments.cash_adjustments.approve','payments','Independently approve cash shortfall settlement.','RESTRICTED'),
      ('payments.cash_policies.manage','payments','Propose cash shortfall operating policy.','RESTRICTED'),
      ('payments.cash_policies.approve','payments','Independently approve cash shortfall policy evidence.','RESTRICTED') on conflict do nothing;
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Financial history requires forward repair, never a destructive down migration.');
}
