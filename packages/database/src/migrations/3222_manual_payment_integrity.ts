import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Expand only. Historical ambiguity is retained and blocked, never deduplicated. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table payments.receiving_destinations (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      provider text not null check(provider in ('BKASH','NAGAD')),
      account_type text not null check(account_type in ('PERSONAL_RETAIL_ACCOUNT','MERCHANT')),
      receiving_number text not null check(receiving_number ~ '^01[3-9][0-9]{8}$'),
      recipient_name text not null check(length(recipient_name) between 1 and 160),
      currency_code text not null default 'BDT' check(currency_code='BDT'),
      transfer_action text not null check(transfer_action in ('MERCHANT_PAYMENT','PAYMENT_QR','UNVERIFIED')),
      instructions text not null check(length(instructions) between 1 and 1000),
      financial_account_id uuid not null,
      state text not null default 'DRAFT' check(state in ('DRAFT','APPROVED','SUSPENDED','RETIRED')),
      provider_evidence_reference text, created_by uuid not null, approved_by uuid, approved_at timestamptz,
      revision bigint not null default 1, created_at timestamptz not null default now(),
      unique(organization_id,id),
      foreign key(organization_id,financial_account_id) references finance.financial_accounts(organization_id,id),
      check(state <> 'APPROVED' or (approved_by is not null and approved_by <> created_by
        and approved_at is not null and length(provider_evidence_reference)>0 and transfer_action <> 'UNVERIFIED'))
    );
    create index receiving_destinations_queue on payments.receiving_destinations(organization_id,created_at desc,id desc);
    create table payments.operating_policy_proposals (
      id uuid primary key default uuidv7(),organization_id uuid not null references platform.organizations(id),
      submission_minutes integer not null check(submission_minutes between 15 and 10080),
      review_minutes integer not null check(review_minutes between 1 and 10080),
      created_by uuid not null,created_at timestamptz not null default now(),unique(organization_id,id)
    );
    create table payments.operating_policy_revisions (
      id uuid primary key default uuidv7(),organization_id uuid not null references platform.organizations(id),
      submission_minutes integer not null check(submission_minutes between 15 and 10080),
      review_minutes integer not null check(review_minutes between 1 and 10080),
      approval_reference text not null check(length(approval_reference) between 1 and 512),
      created_by uuid not null,approved_by uuid not null,created_at timestamptz not null default now(),
      proposal_id uuid not null unique,
      foreign key(organization_id,proposal_id) references payments.operating_policy_proposals(organization_id,id),
      check(created_by<>approved_by),unique(organization_id,id)
    );
    create table payments.receiving_destination_history (
      organization_id uuid not null, destination_id uuid not null, revision bigint not null,
      snapshot jsonb not null, actor_id uuid not null, reason text not null, recorded_at timestamptz not null default now(),
      primary key(organization_id,destination_id,revision),
      foreign key(organization_id,destination_id) references payments.receiving_destinations(organization_id,id)
    );
    alter table payments.payment_intents add column destination_id uuid,
      add column destination_revision bigint, add column review_expires_at timestamptz,
      add column operating_policy_id uuid,
      add constraint intent_operating_policy foreign key(organization_id,operating_policy_id)
        references payments.operating_policy_revisions(organization_id,id),
      add constraint intent_destination_revision foreign key(organization_id,destination_id,destination_revision)
        references payments.receiving_destination_history(organization_id,destination_id,revision),
      add constraint intent_destination_pair check((destination_id is null)=(destination_revision is null)),
      add constraint bounded_payment_review check(review_expires_at is null or (expires_at is not null and review_expires_at>=expires_at));
    alter table payments.payment_attempts add column review_state text not null default 'PENDING'
      check(review_state in ('PENDING','UNDER_REVIEW','CORRECTION_REQUESTED','ESCALATED','RESOLVED'));
    create index payment_claim_review_queue on payments.payment_attempts(organization_id,submitted_at,id)
      where status='PENDING_VERIFICATION';

    -- Retain the old normalizer's conservative collision scope. This is not a
    -- claim about provider-global reference semantics. Reversal cannot free it.
    create table payments.receipt_reference_fences (
      organization_id uuid not null, payment_method_id uuid not null, reference text not null,
      historical_count integer not null default 1,
      primary key(organization_id,payment_method_id,reference),
      foreign key(organization_id,payment_method_id) references payments.payment_methods(organization_id,id)
    );
    insert into payments.receipt_reference_fences(organization_id,payment_method_id,reference,historical_count)
      select organization_id,payment_method_id,normalized_external_reference,count(*)::integer
      from payments.payments group by organization_id,payment_method_id,normalized_external_reference;
    create function payments.fence_external_receipt() returns trigger language plpgsql as $$
    begin
      if TG_OP='UPDATE' then
        if (new.organization_id,new.payment_method_id,new.normalized_external_reference,new.amount,new.currency_code,new.source_attempt_id)
          is distinct from (old.organization_id,old.payment_method_id,old.normalized_external_reference,old.amount,old.currency_code,old.source_attempt_id) then
          raise exception 'Receipt identity and amount are immutable' using errcode='23514';
        end if;
      else
        insert into payments.receipt_reference_fences(organization_id,payment_method_id,reference)
          values(new.organization_id,new.payment_method_id,new.normalized_external_reference);
      end if;
      return new;
    end $$;
    create trigger permanent_receipt_identity before insert or update on payments.payments
      for each row execute function payments.fence_external_receipt();

    create table payments.verified_receipt_evidence (
      organization_id uuid not null, payment_id uuid not null, order_id uuid not null,
      actual_transaction_id text not null check(length(actual_transaction_id) between 4 and 128),
      receiving_number text not null, currency_code text not null check(currency_code='BDT'), value_time timestamptz not null,
      evidence_source text not null check(evidence_source in ('ACCOUNT_HISTORY','PROVIDER_STATEMENT')),
      evidence_reference text not null check(length(evidence_reference) between 1 and 512),
      financial_account_id uuid not null, reviewer_id uuid not null, verified_at timestamptz not null default now(),
      allocated_amount numeric(20,4) not null check(allocated_amount>=0),
      unallocated_amount numeric(20,4) not null check(unallocated_amount>=0),
      disposition text not null check(disposition in ('ALLOCATED','EXCESS_LIABILITY','LATE_RECEIPT_LIABILITY')),
      primary key(organization_id,payment_id),
      foreign key(organization_id,payment_id) references payments.payments(organization_id,id),
      foreign key(organization_id,order_id) references orders.orders(organization_id,id),
      foreign key(organization_id,financial_account_id) references finance.financial_accounts(organization_id,id)
    );
    create table payments.receipt_corrections (
      organization_id uuid not null, payment_id uuid not null, reason text not null,
      evidence_reference text not null, actor_id uuid not null, created_at timestamptz not null default now(),
      primary key(organization_id,payment_id),
      foreign key(organization_id,payment_id) references payments.verified_receipt_evidence(organization_id,payment_id)
    );
    create table payments.review_escalations (
      organization_id uuid not null,intent_id uuid not null,created_at timestamptz not null default now(),
      primary key(organization_id,intent_id),
      foreign key(organization_id,intent_id) references payments.payment_intents(organization_id,id)
    );
    create index receipt_exception_queue on payments.verified_receipt_evidence(organization_id,verified_at,payment_id)
      where unallocated_amount>0;
    create table payments.refund_reference_fences (
      organization_id uuid not null,payment_method_id uuid not null,reference text not null,
      primary key(organization_id,payment_method_id,reference),
      foreign key(organization_id,payment_method_id) references payments.payment_methods(organization_id,id)
    );
    insert into payments.refund_reference_fences(organization_id,payment_method_id,reference)
      select distinct organization_id,payment_method_id,normalized_external_reference from payments.refunds
      where normalized_external_reference is not null;
    create function payments.fence_refund_reference() returns trigger language plpgsql as $$
    begin
      if new.normalized_external_reference is not null and (TG_OP='INSERT' or old.normalized_external_reference is null) then
        insert into payments.refund_reference_fences(organization_id,payment_method_id,reference)
          values(new.organization_id,new.payment_method_id,new.normalized_external_reference);
      elsif TG_OP='UPDATE' and old.normalized_external_reference is not null and
        (new.organization_id,new.payment_method_id,new.normalized_external_reference) is distinct from
        (old.organization_id,old.payment_method_id,old.normalized_external_reference) then
        raise exception 'Refund transaction identity is permanent' using errcode='23514';
      end if;
      return new;
    end $$;
    create trigger permanent_refund_reference before insert or update on payments.refunds
      for each row execute function payments.fence_refund_reference();
    create function payments.immutable_payment_evidence() returns trigger language plpgsql as $$
    begin raise exception 'Payment evidence is append only' using errcode='23514'; end $$;
    create trigger immutable_destination_history before update or delete on payments.receiving_destination_history
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_receipt_evidence before update or delete on payments.verified_receipt_evidence
      for each row execute function payments.immutable_payment_evidence();
    create function payments.check_verified_receipt_conservation() returns trigger language plpgsql as $$
    declare receipt payments.payments%rowtype; allocated numeric; posted numeric;
    begin
      select * into strict receipt from payments.payments where organization_id=new.organization_id and id=new.payment_id;
      select coalesce(sum(amount),0) into allocated from payments.payment_allocations
        where organization_id=new.organization_id and payment_id=new.payment_id and order_id=new.order_id;
      select coalesce(sum(e.amount_delta),0) into posted from finance.finance_transactions t
        join finance.financial_account_entries e on e.organization_id=t.organization_id and e.finance_transaction_id=t.id
        where t.organization_id=new.organization_id and t.source_domain='payments.payment' and t.source_id=new.payment_id
          and t.transaction_type='PAYMENT_SOURCE_POSTING' and e.financial_account_id=new.financial_account_id
          and e.currency_code=new.currency_code;
      if receipt.amount<>new.allocated_amount+new.unallocated_amount or allocated<>new.allocated_amount
        or receipt.amount<>posted or receipt.currency_code<>new.currency_code or receipt.external_reference<>new.actual_transaction_id
        or receipt.confirmed_by_actor_id is distinct from new.reviewer_id then
        raise exception 'Verified receipt, allocations and Finance must conserve actual funds' using errcode='23514';
      end if;
      return new;
    end $$;
    create constraint trigger verified_receipt_conservation after insert on payments.verified_receipt_evidence
      deferrable initially deferred for each row execute function payments.check_verified_receipt_conservation();
    create trigger immutable_receipt_fence before update or delete on payments.receipt_reference_fences
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_receipt_corrections before update or delete on payments.receipt_corrections
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_operating_policy before update or delete on payments.operating_policy_revisions
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_operating_proposal before update or delete on payments.operating_policy_proposals
      for each row execute function payments.immutable_payment_evidence();
    create trigger immutable_refund_fence before update or delete on payments.refund_reference_fences
      for each row execute function payments.immutable_payment_evidence();

    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values
      ('payments.destinations.view','payments','View private receiving destinations.','HIGH'),
      ('payments.destinations.edit','payments','Draft receiving destination revisions.','HIGH'),
      ('payments.destinations.approve','payments','Independently approve evidenced receiving destinations.','RESTRICTED'),
      ('payments.review','payments','Review payment claims and aging.','HIGH'),
      ('payments.correct','payments','Correct verified receipts with independent evidence.','RESTRICTED')
      on conflict do nothing;
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Payment evidence requires forward repair; no automatic down migration.');
}
