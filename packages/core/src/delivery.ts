/**
 * Provider-facing contract only. Delivery remains Maevelle's authoritative
 * state machine; a courier adapter merely reports an external booking result.
 */
export interface CourierBookingRequest {
  readonly deliveryId: string;
  readonly merchantReference: string;
  readonly pickup: {
    readonly locationId: string;
    /** Provider-owned pickup/store identifier selected by Maevelle mapping. */
    readonly providerLocationId?: string;
  };
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
  readonly packages: readonly {
    readonly packageNumber: number;
    readonly weight?: { readonly value: string; readonly unit: 'KG' };
    readonly dimensions?: {
      readonly length: string;
      readonly width: string;
      readonly height: string;
      readonly unit: 'CM' | 'IN';
    };
    readonly declaredValue?: string;
  }[];
  readonly contents: {
    readonly quantity: number;
    readonly description: string;
  };
}

export interface CourierCapabilities {
  readonly booking: true;
  readonly cancellation: boolean;
  readonly tracking: boolean;
  readonly webhooks: boolean;
  readonly cod: boolean;
  readonly codUpdate: boolean;
  readonly returnTracking: boolean;
  readonly serviceability: boolean;
  readonly quoting: boolean;
}

export type CourierBookingResult =
  | {
      readonly kind: 'BOOKED';
      readonly providerBookingId: string;
      readonly trackingReference?: string;
      readonly trackingUrl?: string;
      readonly providerStatus?: string;
      readonly charge?: {
        readonly amount: string;
        readonly currency: string;
        readonly basis: 'ESTIMATE' | 'ACTUAL';
        readonly providerReference?: string;
      };
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
  getCapabilities(): CourierCapabilities;
  checkServiceability?(input: {
    readonly district?: string;
    readonly city?: string;
    readonly area?: string;
    readonly postalCode?: string;
  }): Promise<{ readonly serviceable: boolean; readonly reasonCode?: string }>;
  quote?(request: CourierBookingRequest): Promise<{
    readonly amount: string;
    readonly currency: string;
    readonly baseAmount?: string;
    readonly discountAmount?: string;
    readonly codFeeAmount?: string;
    readonly additionalChargeAmount?: string;
    readonly providerQuoteReference?: string;
    readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
    readonly expiresAt?: string;
  }>;
  createBooking(request: CourierBookingRequest): Promise<CourierBookingResult>;
  getBooking?(providerBookingId: string): Promise<CourierTrackingResult>;
  cancelBooking?(
    providerBookingId: string,
  ): Promise<
    | { readonly kind: 'CANCELLED' }
    | { readonly kind: 'REJECTED'; readonly reasonCode: string }
    | { readonly kind: 'UNKNOWN_OUTCOME' }
  >;
}

export type NormalizedCourierStatus =
  | 'BOOKED'
  | 'HANDED_OVER'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'ATTEMPT_FAILED'
  | 'FAILED'
  | 'RTO_INITIATED'
  | 'RETURNING'
  | 'RETURNED_TO_ORIGIN'
  | 'LOST'
  | 'DAMAGED'
  | 'CANCELLED';

export interface CourierTrackingEvent {
  readonly providerEventId?: string;
  readonly providerStatus: string;
  readonly normalizedStatus: NormalizedCourierStatus;
  readonly occurredAt: string;
  readonly reasonCode?: string;
  readonly note?: string;
}

export interface CourierTrackingResult {
  readonly providerBookingId: string;
  readonly providerStatus?: string;
  readonly events: readonly CourierTrackingEvent[];
}
