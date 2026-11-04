import assert from 'node:assert/strict';
import { sql } from 'kysely';
import { hashToken } from '@maevelle/security';
import type { UpgradeCase } from '../upgrade-cases.js';
import { checkoutUpgradeCases } from './upgrade-cases.js';

let guestDraftId = '',
  accountDraftId = '',
  addressId = '';
export const checkoutDeliveryUpgradeCase: UpgradeCase = {
  async before(db, organizationId) {
    await checkoutUpgradeCases['3219_checkout_foundation']!.before(db, organizationId);
    const guest = await sql<{
      id: string;
    }>`insert into orders.checkout_guest_sessions(organization_id,token_hash)
      values(${organizationId},${hashToken(crypto.randomUUID())}) returning id`.execute(db);
    guestDraftId = (
      await sql<{
        id: string;
      }>`insert into orders.checkout_drafts(organization_id,guest_session_id,source_kind,currency_code)
      values(${organizationId},${guest.rows[0]!.id},'BUY_NOW','BDT') returning id`.execute(db)
    ).rows[0]!.id;
    const userId = crypto.randomUUID();
    await sql`insert into iam.users(id,name,email,email_verified) values(${userId},'Synthetic upgrade',${`${userId}@example.test`},true)`.execute(
      db,
    );
    const customer = (
      await sql<{
        id: string;
      }>`insert into customers.customers(organization_id,customer_number,display_name,first_source,latest_source)
      values(${organizationId},${crypto.randomUUID()},'Synthetic account','STOREFRONT','STOREFRONT') returning id`.execute(
        db,
      )
    ).rows[0]!.id;
    const account = (
      await sql<{
        id: string;
      }>`insert into customers.customer_accounts(organization_id,customer_id,user_id,link_type)
      values(${organizationId},${customer},${userId},'GUEST_CONVERSION') returning id`.execute(db)
    ).rows[0]!.id;
    accountDraftId = (
      await sql<{
        id: string;
      }>`insert into orders.checkout_drafts(organization_id,owner_account_id,owner_customer_id,owner_user_id,source_kind,currency_code)
      values(${organizationId},${account},${customer},${userId},'BUY_NOW','BDT') returning id`.execute(
        db,
      )
    ).rows[0]!.id;
    addressId = (
      await sql<{
        id: string;
      }>`insert into customers.customer_addresses(organization_id,customer_id,recipient_name,address_line_1,country_code)
      values(${organizationId},${customer},'Synthetic address','Preserve this address','BD') returning id`.execute(
        db,
      )
    ).rows[0]!.id;
  },
  async after(db, organizationId) {
    await checkoutUpgradeCases['3219_checkout_foundation']!.after(db, organizationId);
    const drafts = await sql<{
      revision: string;
    }>`select revision::text from orders.checkout_drafts where organization_id=${organizationId}
      and id in (${guestDraftId},${accountDraftId})`.execute(db);
    assert.equal(drafts.rows.length, 2);
    assert.ok(drafts.rows.every((d) => d.revision === '1'));
    const address = await sql<{
      address_line_1: string;
      delivery_instructions: null;
    }>`select address_line_1,delivery_instructions
      from customers.customer_addresses where id=${addressId}`.execute(db);
    assert.equal(address.rows[0]!.address_line_1, 'Preserve this address');
    assert.equal(address.rows[0]!.delivery_instructions, null);
    assert.equal(
      (await sql`select draft_id from orders.checkout_draft_delivery`.execute(db)).rows.length,
      0,
    );
  },
};
