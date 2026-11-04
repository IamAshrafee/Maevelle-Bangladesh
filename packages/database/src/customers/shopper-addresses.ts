import { sql, type Kysely } from 'kysely';
import type { ShopperAddressDto, ShopperAddressInput } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { addCustomerAddress, updateCustomerAddress, removeCustomerAddress } from '../customers.js';
import { CustomerIdentityValidationError } from '../customer-identities.js';
import { contactText, normalizeDeliveryContact } from './delivery-contact.js';
import { CheckoutError, type CheckoutAuthority } from '../checkout/types.js';
import { lockCheckoutAuthority } from '../checkout/authority.js';
import { checkoutTransaction, receipt, finish } from '../checkout/commands.js';

export type AccountAuthority = Extract<CheckoutAuthority, { kind: 'ACCOUNT' }>;
export function requireAddressAccount(owner: CheckoutAuthority): asserts owner is AccountAuthority {
  if (owner.kind !== 'ACCOUNT')
    throw new CheckoutError('SESSION_EXPIRED', 'Sign in to access saved addresses.');
}
export async function ownedShopperAddress(
  tx: Kysely<DatabaseSchema>,
  owner: AccountAuthority,
  id: string,
): Promise<ShopperAddressDto> {
  const result =
    await sql<ShopperAddressDto>`select id,version::text revision,recipient_name as "recipientName",
    phone mobile,country_code as "countryCode",geography_node_id as "geographyNodeId",address_line_1 as "addressLine1",
    address_line_2 as "addressLine2",delivery_instructions instructions,label,is_default as "isDefault"
    from customers.customer_addresses where organization_id=${owner.organizationId} and customer_id=${owner.customerId}
      and id=${id} and status='ACTIVE' for share`.execute(tx);
  if (!result.rows[0]) throw new CheckoutError('NOT_FOUND', 'Saved address was not found.');
  return result.rows[0];
}
export async function listShopperAddresses(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  offset = 0,
) {
  requireAddressAccount(owner);
  return checkoutTransaction(db, async (tx) => {
    await lockCheckoutAuthority(tx, owner);
    const rows =
      await sql<ShopperAddressDto>`select id,version::text revision,recipient_name as "recipientName",phone mobile,
      country_code as "countryCode",geography_node_id as "geographyNodeId",address_line_1 as "addressLine1",
      address_line_2 as "addressLine2",delivery_instructions instructions,label,is_default as "isDefault"
      from customers.customer_addresses where organization_id=${owner.organizationId} and customer_id=${owner.customerId}
        and status='ACTIVE' order by is_default desc,id limit 21 offset ${offset}`.execute(tx);
    return {
      items: rows.rows.slice(0, 20),
      nextOffset: rows.rows.length > 20 ? offset + 20 : null,
    };
  });
}
/** Explicit address-book command; never invoked implicitly from a Checkout edit. */
export async function mutateShopperAddress(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  command:
    | { kind: 'CREATE'; address: ShopperAddressInput }
    | { kind: 'UPDATE'; id: string; revision: string; address: ShopperAddressInput }
    | { kind: 'REMOVE'; id: string; revision: string },
  key: string,
) {
  requireAddressAccount(owner);
  return checkoutTransaction(db, async (tx) => {
    // Match Customers writers: Customer exclusive before account/address locks, never upgrade a shared lock.
    await lockCheckoutAuthority(tx, owner, { customerWrite: true });
    const record = await receipt(tx, owner, key, `address.${command.kind}`, command);
    if (record.draftId) return { id: record.draftId };
    if (command.kind !== 'CREATE') {
      const address = await ownedShopperAddress(tx, owner, command.id);
      if (address.revision !== command.revision)
        throw new CheckoutError('STALE_REVISION', 'Saved address changed. Reload your addresses.');
    }
    const base = {
      organizationId: owner.organizationId,
      customerId: owner.customerId,
      actorId: owner.userId,
    };
    let id: string;
    if (command.kind === 'REMOVE') {
      id = command.id;
      await removeCustomerAddress(tx, { ...base, addressId: id });
    } else {
      let contact;
      let label;
      try {
        contact = normalizeDeliveryContact(command.address);
        label = contactText(command.address.label, 60, false);
      } catch (error) {
        if (error instanceof CustomerIdentityValidationError)
          throw new CheckoutError(
            'INVALID_CONTACT',
            'Check the recipient, mobile and address fields.',
          );
        throw error;
      }
      const fields = {
        ...base,
        ...contact,
        phone: contact.mobile,
        label,
        ...(command.address.isDefault === undefined
          ? {}
          : { isDefault: command.address.isDefault }),
        addressLine2: contact.addressLine2 ?? null,
      };
      if (command.kind === 'CREATE') {
        const count = await sql<{
          count: number;
        }>`select count(*)::integer count from customers.customer_addresses
          where organization_id=${owner.organizationId} and customer_id=${owner.customerId} and status='ACTIVE'`.execute(
          tx,
        );
        if (count.rows[0]!.count >= 50)
          throw new CheckoutError('ADDRESS_LIMIT', 'Remove an unused saved address first.');
        id = (
          await addCustomerAddress(tx, {
            ...fields,
            label: label ?? '',
            addressLine2: fields.addressLine2 ?? '',
          })
        ).id;
      } else {
        id = command.id;
        await updateCustomerAddress(tx, { ...fields, addressId: id });
      }
    }
    await finish(tx, record.id, id, 'customers.address');
    return { id };
  });
}
