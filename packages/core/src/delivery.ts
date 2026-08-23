/**
 * Provider-facing contract only. Delivery remains Maevelle's authoritative
 * state machine; a courier adapter merely reports an external booking result.
 */
export interface CourierBookingRequest {
  readonly deliveryId: string;
  readonly merchantReference: string;
  readonly recipient: {
    readonly name: string;
    readonly phone: string;
    readonly address: string;
  };
  readonly cod: {
    readonly required: boolean;
    readonly expectedAmount: string;
    readonly currency: string;
  };
}

export type CourierBookingResult =
  | {
      readonly kind: 'BOOKED';
      readonly providerBookingId: string;
      readonly trackingReference?: string;
      readonly providerStatus?: string;
    }
  | {
      /** A timeout is not proof that the provider did not accept the booking. */
      readonly kind: 'UNKNOWN_OUTCOME';
      readonly providerStatus?: string;
    }
  | {
      readonly kind: 'REJECTED';
      readonly reasonCode: string;
    };

export interface CourierProviderPort {
  readonly providerCode: string;
  createBooking(request: CourierBookingRequest): Promise<CourierBookingResult>;
}
