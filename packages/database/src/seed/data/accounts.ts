import type { FinancialAccountSeedItem } from '../types.js';

/**
 * Standard operating financial accounts for Maevelle Bangladesh.
 *
 * Accounts:
 * 1. BKASH-MAISHA: Maisha Bkash (01308706391)
 * 2. BKASH-ASHRAFEE: Ashrafee Bkash (01570283271)
 * 3. NAGAD-ASHRAFEE: Ashrafee Nagad (01612381085)
 * 4. CASH-MAISHA: Maisha Cashdrawer
 *
 * All created with an initial opening balance of 0 BDT. Operators can later
 * establish an initial float via the Admin portal using the one-time opening balance action.
 */
export const accountSeedData: readonly FinancialAccountSeedItem[] = [
  {
    accountNumber: 'BKASH-MAISHA',
    name: 'Maisha Bkash',
    accountType: 'MOBILE_WALLET',
    currencyCode: 'BDT',
    referenceLabel: '01308706391',
    openingBalance: '0',
    status: 'ACTIVE',
    previousAccountNumbers: ['MAI-BK-1'],
  },
  {
    accountNumber: 'BKASH-ASHRAFEE',
    name: 'Ashrafee Bkash',
    accountType: 'MOBILE_WALLET',
    currencyCode: 'BDT',
    referenceLabel: '01570283271',
    openingBalance: '0',
    status: 'ACTIVE',
  },
  {
    accountNumber: 'NAGAD-ASHRAFEE',
    name: 'Ashrafee Nagad',
    accountType: 'MOBILE_WALLET',
    currencyCode: 'BDT',
    referenceLabel: '01612381085',
    openingBalance: '0',
    status: 'ACTIVE',
    previousAccountNumbers: ['ASH-NAG-1'],
  },
  {
    accountNumber: 'CASH-MAISHA',
    name: 'Maisha Cashdrawer',
    accountType: 'CASH',
    currencyCode: 'BDT',
    referenceLabel: 'Cashdrawer',
    openingBalance: '0',
    status: 'ACTIVE',
  },
];
