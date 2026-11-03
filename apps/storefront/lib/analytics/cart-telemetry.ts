import type { CartInteraction, CartObservationDto } from '@maevelle/contracts';
import { currentCommerceConsent, permitsAnalytics } from './consent';
import { sendStorefrontObservation } from './observation-transport';

function minimalInteraction(interaction: CartInteraction): CartInteraction {
  const {
    name,
    data: { mode },
  } = interaction;
  switch (name) {
    case 'CART_VIEWED':
      return { name, data: { mode, surface: interaction.data.surface } };
    case 'CART_COMMAND_INITIATED':
      return { name, data: { mode, command: interaction.data.command } };
    case 'CART_COMMAND_REJECTED':
      return {
        name,
        data: { mode, command: interaction.data.command, reason: interaction.data.reason },
      };
    case 'CART_RECOVERY_VIEWED':
      return { name, data: { mode } };
  }
}

/** First-party only. No provider channel, storage journal, or shopper identifiers. */
export async function emitCartObservation(interaction: CartInteraction): Promise<boolean> {
  try {
    const consent = currentCommerceConsent();
    if (!permitsAnalytics(consent)) return false;
    const event: CartObservationDto = {
      ...minimalInteraction(interaction),
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      origin: 'BROWSER',
      consent: { ...consent, marketing: 'DENIED', preferences: 'DENIED' },
    };
    return await sendStorefrontObservation(event, 'omit');
  } catch {
    return false;
  }
}
