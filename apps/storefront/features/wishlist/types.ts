export type WishlistCategory = 'all' | 'jewelry' | 'hair' | 'bags' | 'wraps';

export interface WishlistItem {
  readonly alt: string;
  readonly badge?: string;
  readonly badgeType?: 'scarcity' | 'primary-fixed' | 'secondary-fixed' | 'surface-container-high' | 'primary-fixed-dim';
  readonly category: WishlistCategory;
  readonly categoryLabel: string;
  readonly deliveryTag?: string;
  readonly discountTag?: string;
  readonly handle: string;
  readonly id: string;
  readonly imageUrl: string;
  readonly inStock: boolean;
  readonly originalPrice?: number;
  readonly price: number;
  readonly subtitle: string;
  readonly title: string;
}

export const FREE_DELIVERY_THRESHOLD = 9000;

export const DEFAULT_WISHLIST_ITEMS: readonly WishlistItem[] = [
  {
    id: 'wishlist-1',
    handle: 'aurelia-pearl-drop-earrings',
    category: 'jewelry',
    categoryLabel: 'Jewelry',
    title: 'Aurelia Pearl Drop Earrings',
    subtitle: '18K Gold Plated • Ivory Luster',
    price: 1650,
    originalPrice: 2100,
    discountTag: '21% Off',
    badge: 'Only 2 Left',
    badgeType: 'scarcity',
    deliveryTag: 'Dhaka 24–48h Delivery',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDzkpUPJ12sKWW5onX-6c7kVGKHfuMKVHW_sXP34-aBJ4zZNTPohJYomko0376CDMgXcaQLjwx6_QzSgV6rzRY4rzTmjtMUkSscx4F8aaAahX0LVll4_xMVWmYkAOLSwKHADkGRIsXTUb17ErkjhUsLyNOWhefVosIxyIjzisFpP_T2es4Sz_nd3Uarp7N4NYiqJjK5h-mRDz-1uI6AKDlHXZLVGUb-6NNq0YrGU0xWAM3PvV4k75cE',
    alt: 'Exquisite gold filigree dangling earrings with luminous natural baroque pearls displayed on a deep navy blue velvet pedestal in warm boutique sunlight with soft shadows',
    inStock: true,
  },
  {
    id: 'wishlist-2',
    handle: 'flora-jamdani-silk-wrap',
    category: 'wraps',
    categoryLabel: 'Wrap',
    title: 'Flora Jamdani Silk Wrap',
    subtitle: 'Mulberry Silk • Hand-Rolled Edge',
    price: 1200,
    deliveryTag: 'Dhaka Express',
    badge: 'Artisan Batch',
    badgeType: 'primary-fixed',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuB5cW9tFpoN92QEcN94j0r3Fw8IfYVg_2mKRrjgC0KABMNyPVFLET1Guor_yXsWuq_kqb6Lrl7UKJgSuCZbOd_p2KHwC39egxt3q-FYA9mn2spe7Ht274H6uNWJiUqwy1K-6MXKWINeV1tvcLeWlly2nBcYmQRkn8jyhNX_DibcLGiX0UHTwhoteSoy2mOedAmIGSXugMwiUDF85E7WSk3ZEf5VP4cMH3siI1Metk82wB90cU0BiZdo',
    alt: 'Graceful model draped in traditional emerald green and shimmering gold Jamdani silk fabric with delicate pink botanical floral weave seated elegantly in an sunlit Dhaka heritage drawing room',
    inStock: true,
  },
  {
    id: 'wishlist-3',
    handle: 'quilted-mini-crossbody',
    category: 'bags',
    categoryLabel: 'Handbag',
    title: 'Quilted Mini Crossbody',
    subtitle: 'Blush Cream Nappa • Gold Chain',
    price: 2950,
    deliveryTag: '1 Unit Left',
    badge: 'Low Stock',
    badgeType: 'secondary-fixed',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCVMJEBZjI5rSJ9i45vU32PaT9friW48MlJ2UH0zRx7Dyaf-_zTJPDT4MBoaemklKdzQThRzsF8ho9YhPa-wpBIElyTDYMx2Elz7vyMXDIK-NILYXp8hYnVdaE2eKuvHMzUyT42bFq6LSKAL-88rHoYirC5X29X_PjgPvP1AHIX4D2WNb8z7KZ5ZqiRO1n5DGwtQ7S55ozW8-lw9sCKh98ZyXGH15KNx4kdPqioM1HGbAFGWYm4QKAG',
    alt: 'Blush pink quilted leather designer mini handbag with polished gold chain strap and charm detail resting on draped silk fabric next to romantic fresh garden roses in Parisian setting',
    inStock: true,
  },
  {
    id: 'wishlist-4',
    handle: 'plush-velvet-silk-ribbon',
    category: 'hair',
    categoryLabel: 'Hair Accent',
    title: 'Plush Velvet Silk Ribbon',
    subtitle: 'Deep Berry Silk • Hand-Tied',
    price: 850,
    deliveryTag: 'Ready to Ship',
    badge: 'Trending in Dhaka',
    badgeType: 'surface-container-high',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC2VSdj9EIVfEU5Ei9fwYA-TKQmsNgBjl9xSQVTwp7NUQdjypVNCWazUEX3jAcl_fuhubV125KMMU14IA3Y2n1sH724DRgULOhPJY_LYX2oOYcygMRV7PKFdVm-TxHR4Q5CAOPysPJFuRAM1T5enCbB5JPAK61oDekNVTN23sruQnf4mgaMy9CF4zZTf_bbNnYZaGB06BH0VaYVrHaBhdeZukGefTNzvpHeuX0YtF66rKoiDdT2yd3E',
    alt: 'Curated flatlay arrangement of luxurious mauve pink silk velvet hair ribbons, pearlescent hair clips, and tortoiseshell barrettes on warm Italian marble vanity tabletop beside dried eucalyptus',
    inStock: true,
  },
  {
    id: 'wishlist-5',
    handle: 'starburst-zirconia-choker',
    category: 'jewelry',
    categoryLabel: 'Jewelry',
    title: 'Starburst Zirconia Choker',
    subtitle: 'Sterling Silver • Grade AAA',
    price: 1850,
    originalPrice: 2300,
    badge: 'Back in Stock',
    badgeType: 'primary-fixed-dim',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBRFvPAIL7d8meRLbCEK02Df7NVnogJoUTfNz6gDwTInuJyfAOG8yH9sURanLFryhm5fGM0-w_I3dCQwhOuScKj-aJdd62sizsF0qNU0Ps33R93CxVFk5SF_du7KoS-NUP4-yoeEqqpWSeSZLdqyjFEpveXEt4D953k5jEd0i4tcOaRvQstfngRJF0AyPcqOJbBcx8aZBAGMAxxKoL3Rbiv-zuNayHsmGEEz7LhzptnxrK_hS3j1OHB',
    alt: 'Dainty sparkling zirconia starburst choker necklace laid over smooth warm sandstone with delicate dried botanical accents in soft editorial studio light',
    inStock: true,
  },
];
