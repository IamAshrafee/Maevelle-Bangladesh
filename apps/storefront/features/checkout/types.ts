export type DeliveryZone = 'dhaka' | 'outside';
export type PaymentMethodCode = 'bkash' | 'nagad' | 'cod';
export type CheckoutStep = 1 | 2 | 3;
export type MobileWalletType = 'bkash' | 'nagad';

export interface CheckoutLineItem {
  readonly id: string;
  readonly productTitle: string;
  readonly sku: string;
  readonly variantDescription: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly gross: number;
  readonly discount: number;
  readonly net: number;
  readonly imageUrl: string;
  readonly imageAlt: string;
}

export interface CheckoutContact {
  fullName: string;
  phone: string;
  email: string;
}

export interface CheckoutAddress {
  recipientName: string;
  phone: string;
  zone: DeliveryZone;
  district: string;
  streetAddress: string;
  specialNote: string;
}

export interface VoucherInfo {
  code: string;
  discount: number;
  label: string;
  isApplied: boolean;
}

export interface PlacedOrderSummary {
  orderId: string;
  customerName: string;
  deliveryZoneLabel: string;
  paymentMethodLabel: string;
  totalFormatted: string;
  transactionId?: string | undefined;
  senderPhone?: string | undefined;
  isManualPayment?: boolean | undefined;
}

export const DEFAULT_CHECKOUT_ITEMS: readonly CheckoutLineItem[] = [
  {
    id: 'item-1',
    productTitle: 'Aurelia Pearl Drop Earrings',
    sku: 'AUR-PRL-01',
    variantDescription: '18K Gold Plated • Fresh Water',
    quantity: 1,
    unitPrice: 1650,
    gross: 1650,
    discount: 0,
    net: 1650,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDTY9EpCZ52WQCdNXT1rGoqpXctuUuXxVykwJW9Oi_KMrFK96orlULF4qvwC7i2csoinKELSRuvZxYFZheJ9Ba8iSAe7si_cGCD47hyifVof0jJtNSN6tivzceTej1lanuEBfpqDyBCJwzog-vmW08vYijGnX_uefLKcguIrGhFyR0vQOsZqbBdc3NG6UpuDCpm9gWPwB54ezF_eTvp0Nqx3tTTUTSEiOym6xxGSbLpoCkhnaIPFxLv',
    imageAlt:
      'Close up photograph of luxurious handcrafted Aurelia freshwater baroque pearl drop earrings mounted on 18K yellow gold plated findings, soft warm natural morning light',
  },
  {
    id: 'item-2',
    productTitle: 'Plush Velvet Hair Ribbon',
    sku: 'VEL-RBN-08',
    variantDescription: 'Deep Berry Silk • Artisan Tie',
    quantity: 1,
    unitPrice: 850,
    gross: 850,
    discount: 0,
    net: 850,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCvH_upW8ip_Ty0A9XRJM7QZpPSjK8x15Mj10w7zpFiTIp4oKR-Z2kRHIjiAYuUndexHHPPGdnpVwruhoMfuBNX_U439IbOaRKXn4Eu4K_2JY2cufomiWuQN6kV0L0_x_wo0PJxHA_E5qo43UGpKseJDh-kBnTuVDVD3futPwfySlrPodGQz70z-LyBvfmwqmczN8I4_9XuCKGZuNvI5Cr6gfZ4hUFEmF4DCQ6hPCfUmzidrQspJ25_',
    imageAlt:
      'Deep berry rose plush velvet hair ribbon bow designed for elegant feminine styling, tailored draped silk velvet fabric texture',
  },
];

export const BANGLADESH_DISTRICTS = [
  { value: 'dhanmondi', label: 'Dhaka - Dhanmondi (1209)', zone: 'dhaka' },
  { value: 'gulshan', label: 'Dhaka - Gulshan 1 & 2 (1212)', zone: 'dhaka' },
  { value: 'banani', label: 'Dhaka - Banani & DOHS (1213)', zone: 'dhaka' },
  { value: 'uttara', label: 'Dhaka - Uttara Sector 1–14 (1230)', zone: 'dhaka' },
  { value: 'mirpur', label: 'Dhaka - Mirpur & Pallabi (1216)', zone: 'dhaka' },
  { value: 'bashundhara', label: 'Dhaka - Bashundhara R/A (1229)', zone: 'dhaka' },
  { value: 'mohammadpur', label: 'Dhaka - Mohammadpur & Lalmatia (1207)', zone: 'dhaka' },
  { value: 'mohakhali', label: 'Dhaka - Mohakhali & Niketan (1212)', zone: 'dhaka' },
  { value: 'wari', label: 'Dhaka - Old Dhaka & Wari (1203)', zone: 'dhaka' },
  { value: 'chattogram', label: 'Chattogram - Nasirabad / Panchlaish', zone: 'outside' },
  { value: 'chattogram-agrabad', label: 'Chattogram - Agrabad & Halishahar', zone: 'outside' },
  { value: 'sylhet', label: 'Sylhet - Zindabazar / Upashahar', zone: 'outside' },
  { value: 'rajshahi', label: 'Rajshahi - Boalia / Shaheb Bazar', zone: 'outside' },
  { value: 'khulna', label: 'Khulna - Sonadanga / Boyra', zone: 'outside' },
  { value: 'barishal', label: 'Barishal - Sadar / Kotwali', zone: 'outside' },
  { value: 'rangpur', label: 'Rangpur - Sadar / GL Roy Road', zone: 'outside' },
  { value: 'mymensingh', label: 'Mymensingh - Sadar / Town Hall', zone: 'outside' },
  { value: 'cumilla', label: 'Cumilla - Kandirpar', zone: 'outside' },
  { value: 'gazipur', label: 'Gazipur - Chowrasta / Board Bazar', zone: 'outside' },
  { value: 'narayanganj', label: 'Narayanganj - Chasara / Bandar', zone: 'outside' },
  { value: 'coxsbazar', label: 'Cox\'s Bazar - Kolatoli / Beach Area', zone: 'outside' },
] as const;
