import { sql, type Kysely } from 'kysely';
import type {
  CheckoutDeliverySnapshot,
  CheckoutDeliveryStateDto,
  UpdateCheckoutDeliveryDto,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { CustomerIdentityValidationError } from '../customer-identities.js';
import { normalizeDeliveryContact } from '../customers/delivery-contact.js';
import { ownedShopperAddress, requireAddressAccount } from '../customers/shopper-addresses.js';
import { deliveryServiceability } from '../orders/delivery-serviceability.js';
import { checkoutTransaction, receipt, finish, audit } from './commands.js';
import { lockCheckoutAuthority } from './authority.js';
import { ownedDraft, draftStatus } from './queries.js';
import { CheckoutError, type CheckoutAuthority, type DraftRow } from './types.js';

interface DeliveryRow {
  recipient_name: string;
  mobile: string;
  geography_node_id: string;
  address_line_1: string;
  address_line_2: string | null;
  instructions: string | null;
  configuration_revision: string;
  saved_address_id: string | null;
  saved_address_revision: string | null;
  current_address_revision: string | null;
  current_address_status: string | null;
}
async function view(tx: Kysely<DatabaseSchema>, row: DraftRow): Promise<CheckoutDeliveryStateDto> {
  const result =
    await sql<DeliveryRow>`select d.*,d.saved_address_revision::text,a.version::text current_address_revision,
    a.status current_address_status from orders.checkout_draft_delivery d
    left join customers.customer_addresses a on a.organization_id=d.organization_id and a.customer_id=d.saved_customer_id and a.id=d.saved_address_id
    where d.organization_id=${row.organization_id} and d.draft_id=${row.id}`.execute(tx);
  const d = result.rows[0];
  const eligibility = d
    ? await deliveryServiceability(tx, {
        organizationId: row.organization_id,
        currency: row.currency_code,
        geographyNodeId: d.geography_node_id,
      })
    : null;
  const savedAddress = d?.saved_address_id
    ? {
        id: d.saved_address_id,
        selectedRevision: d.saved_address_revision!,
        status:
          !d.current_address_revision || d.current_address_status !== 'ACTIVE'
            ? ('REMOVED' as const)
            : d.current_address_revision !== d.saved_address_revision
              ? ('CHANGED' as const)
              : ('CURRENT' as const),
      }
    : null;
  const configurationChanged =
    !!d && eligibility?.configurationRevision !== d.configuration_revision;
  const status = await draftStatus(tx, row);
  return {
    draftId: row.id,
    revision: row.revision,
    draftStatus: status,
    expiresAt: row.expires_at.toISOString(),
    delivery: d
      ? {
          recipientName: d.recipient_name,
          mobile: d.mobile,
          geographyNodeId: d.geography_node_id,
          countryCode: 'BD',
          addressLine1: d.address_line_1,
          addressLine2: d.address_line_2,
          instructions: d.instructions,
        }
      : null,
    savedAddress,
    eligibility,
    configurationChanged,
    reviewRequired:
      status !== 'ACTIVE' ||
      !d ||
      configurationChanged ||
      eligibility?.status !== 'ELIGIBLE' ||
      (!!savedAddress && savedAddress.status !== 'CURRENT'),
    quoteAvailable: false,
    purchaseAvailable: false,
  };
}
export async function getCheckoutDelivery(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  id: string,
) {
  return checkoutTransaction(db, async (tx) => {
    await lockCheckoutAuthority(tx, owner);
    return view(tx, await ownedDraft(tx, owner, id));
  });
}
export async function updateCheckoutDelivery(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  id: string,
  input: UpdateCheckoutDeliveryDto,
  key: string,
) {
  return checkoutTransaction(db, async (tx) => {
    await lockCheckoutAuthority(tx, owner);
    const record = await receipt(tx, owner, key, 'delivery.update', { id, ...input });
    const row = await ownedDraft(tx, owner, record.draftId ?? id);
    if (record.draftId) return view(tx, row);
    const active =
      await sql`select id from orders.checkout_drafts where id=${id} and status='ACTIVE' and expires_at>clock_timestamp()`.execute(
        tx,
      );
    if (!active.rows.length)
      throw new CheckoutError('DRAFT_EXPIRED', 'Checkout draft is no longer active.');
    if (row.revision !== input.revision)
      throw new CheckoutError('STALE_REVISION', 'Checkout changed. Restore it before editing.');
    let delivery: CheckoutDeliverySnapshot;
    let addressId: string | null = null,
      addressRevision: string | null = null;
    try {
      if ('savedAddressId' in input) {
        requireAddressAccount(owner);
        const saved = await ownedShopperAddress(tx, owner, input.savedAddressId);
        if (saved.revision !== input.savedAddressRevision)
          throw new CheckoutError(
            'STALE_REVISION',
            'Saved address changed. Reload your addresses.',
          );
        if (saved.countryCode !== 'BD' || !saved.geographyNodeId || !saved.mobile)
          throw new CheckoutError('INVALID_CONTACT', 'Complete the saved delivery address first.');
        delivery = normalizeDeliveryContact({
          ...saved,
          mobile: saved.mobile,
          geographyNodeId: saved.geographyNodeId,
        });
        addressId = saved.id;
        addressRevision = saved.revision;
      } else if ('delivery' in input) delivery = normalizeDeliveryContact(input.delivery);
      else {
        const current = await view(tx, row);
        if (!current.delivery)
          throw new CheckoutError('INVALID_CONTACT', 'Enter delivery details first.');
        if (current.savedAddress && current.savedAddress.status !== 'CURRENT')
          throw new CheckoutError(
            'ADDRESS_CHANGED',
            'Choose the saved address again or explicitly keep the entered details.',
          );
        delivery = current.delivery;
        addressId = current.savedAddress?.id ?? null;
        addressRevision = current.savedAddress?.selectedRevision ?? null;
      }
    } catch (error) {
      if (error instanceof CustomerIdentityValidationError)
        throw new CheckoutError(
          'INVALID_CONTACT',
          'Check the recipient, mobile and address fields.',
        );
      throw error;
    }
    const eligible = await deliveryServiceability(tx, {
      organizationId: owner.organizationId,
      currency: row.currency_code,
      geographyNodeId: delivery.geographyNodeId,
    });
    if (eligible.status !== 'ELIGIBLE')
      throw new CheckoutError(
        eligible.status,
        'Delivery is unavailable for this area. Choose another area or contact support.',
      );
    await sql`insert into orders.checkout_draft_delivery(organization_id,draft_id,recipient_name,mobile,geography_node_id,country_code,address_line_1,address_line_2,instructions,
      saved_address_id,saved_customer_id,saved_address_revision,configuration_revision)
      values(${owner.organizationId},${id},${delivery.recipientName},${delivery.mobile},${delivery.geographyNodeId},'BD',${delivery.addressLine1},${delivery.addressLine2 ?? null},${delivery.instructions ?? null},
        ${addressId},${addressId && owner.kind === 'ACCOUNT' ? owner.customerId : null},${addressRevision}::bigint,${eligible.configurationRevision})
      on conflict(draft_id) do update set recipient_name=excluded.recipient_name,mobile=excluded.mobile,geography_node_id=excluded.geography_node_id,
        address_line_1=excluded.address_line_1,address_line_2=excluded.address_line_2,instructions=excluded.instructions,
        saved_address_id=excluded.saved_address_id,saved_customer_id=excluded.saved_customer_id,saved_address_revision=excluded.saved_address_revision,configuration_revision=excluded.configuration_revision`.execute(
      tx,
    );
    await sql`update orders.checkout_drafts set revision=revision+1,updated_at=clock_timestamp() where organization_id=${owner.organizationId} and id=${id}`.execute(
      tx,
    );
    await finish(tx, record.id, id);
    await audit(tx, owner, id, 'delivery_updated');
    return view(tx, await ownedDraft(tx, owner, id));
  });
}
