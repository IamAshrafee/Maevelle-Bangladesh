import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table analytics.privacy_browser_sessions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      token_hash text not null unique check(length(token_hash)=43),
      owner_binding text not null check(length(owner_binding)=43),
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now()+interval '30 days',
      check(expires_at>created_at and expires_at<=created_at+interval '30 days'),
      unique(organization_id,id)
    );
    create index privacy_browser_sessions_retention on analytics.privacy_browser_sessions(expires_at);
    create table analytics.commerce_observation_authority (
      organization_id uuid not null,
      event_id uuid not null,
      browser_id uuid not null,
      subject_id uuid not null,
      scope text not null check(scope in ('SESSION','ACCOUNT')),
      purpose text not null default 'ANALYTICS' check(purpose='ANALYTICS'),
      consent_revision bigint not null check(consent_revision>0),
      browser_revision bigint not null check(browser_revision>0),
      policy_version text not null check(length(policy_version) between 1 and 64),
      captured_at timestamptz not null default clock_timestamp(),
      primary key(organization_id,event_id),
      foreign key(organization_id,event_id) references analytics.storefront_events(organization_id,event_id) on delete cascade,
      foreign key(organization_id,browser_id) references analytics.privacy_browser_sessions(organization_id,id) on delete cascade,
      foreign key(organization_id,subject_id,scope,purpose) references analytics.commerce_consent(organization_id,subject_id,scope,purpose) on delete cascade
    );
    create index commerce_observation_subject on analytics.commerce_observation_authority(organization_id,subject_id,scope,purpose);
    create index commerce_observation_browser on analytics.commerce_observation_authority(organization_id,browser_id);
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Privacy preferences require forward repair.');
}
