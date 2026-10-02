import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  Boxes,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleDollarSign,
  HeartHandshake,
  Image,
  KeyRound,
  Landmark,
  PackageCheck,
  PackageSearch,
  Plug,
  ReceiptText,
  RotateCcw,
  Ruler,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Truck,
  UserRoundCog,
  Users,
  Warehouse,
} from 'lucide-react';

import type {
  AccessScopeDto,
  AuthSessionDto,
  CapabilityCatalogItemDto,
  CapabilitySensitivityDto,
  MembershipInvitationDto,
  MembershipStatusDto,
  MembershipTypeDto,
  PermissionPresetDto,
  TeamAuditItemDto,
  TeamLocationOptionDto,
  TeamMemberDetailDto,
  TeamMemberListItemDto,
} from '@maevelle/contracts';

export type {
  AccessScopeDto,
  AuthSessionDto,
  CapabilityCatalogItemDto,
  CapabilitySensitivityDto,
  MembershipInvitationDto,
  MembershipStatusDto,
  MembershipTypeDto,
  PermissionPresetDto,
  TeamAuditItemDto,
  TeamLocationOptionDto,
  TeamMemberDetailDto,
  TeamMemberListItemDto,
};

export interface DomainMeta {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

export const DOMAIN_CATALOG: Record<string, DomainMeta> = {
  catalog: {
    id: 'catalog',
    label: 'Catalog & Merchandising',
    description: 'Products, categories, options, variants, sizing, and publication state.',
    icon: PackageSearch,
  },
  orders: {
    id: 'orders',
    label: 'Orders & Sales',
    description: 'Customer orders, invoices, address changes, and order status.',
    icon: ShoppingBag,
  },
  customers: {
    id: 'customers',
    label: 'Customer Accounts',
    description: 'Customer profiles, contact history, and notes.',
    icon: Users,
  },
  fulfillment: {
    id: 'fulfillment',
    label: 'Fulfillment Operations',
    description: 'Picking, packing, item preparation, and order dispatching.',
    icon: Boxes,
  },
  delivery: {
    id: 'delivery',
    label: 'Delivery & Couriers',
    description: 'Consignments, tracking numbers, couriers (Steadfast, Pathao), and dispatch.',
    icon: Truck,
  },
  returns: {
    id: 'returns',
    label: 'Returns & RTO',
    description: 'Customer return requests, inspection, return-to-origin, and restock.',
    icon: RotateCcw,
  },
  inventory: {
    id: 'inventory',
    label: 'Inventory Management',
    description: 'Stock levels, reservations, adjustments, stocktakes, and valuations.',
    icon: Boxes,
  },
  warehouse: {
    id: 'warehouse',
    label: 'Warehouse Operations',
    description: 'Warehouse locations, internal transfers, and physical storage.',
    icon: Warehouse,
  },
  procurement: {
    id: 'procurement',
    label: 'Procurement & Purchases',
    description: 'Purchase orders, supplier records, and purchase approvals.',
    icon: ReceiptText,
  },
  receiving: {
    id: 'receiving',
    label: 'Receiving & Goods In',
    description: 'Inbound shipment reception, quality verification, and discrepancies.',
    icon: PackageCheck,
  },
  pricing: {
    id: 'pricing',
    label: 'Pricing & Tiers',
    description: 'Base prices, compare-at rates, delivery pricing, and price overrides.',
    icon: Tags,
  },
  promotions: {
    id: 'promotions',
    label: 'Promotions & Coupons',
    description: 'Campaigns, discount codes, eligibility criteria, and usage limits.',
    icon: Tags,
  },
  finance: {
    id: 'finance',
    label: 'Finance & Accounts',
    description: 'Bank and cash accounts, operational expenses, and reconciliation.',
    icon: Landmark,
  },
  payments: {
    id: 'payments',
    label: 'Payments & Collections',
    description: 'Payment receipts, bKash/Nagad verification, and COD settlements.',
    icon: CircleDollarSign,
  },
  costing: {
    id: 'costing',
    label: 'Costing & Landed Cost',
    description: 'Landed cost allocation, customs duties, freight, and item costing.',
    icon: CircleDollarSign,
  },
  assets: {
    id: 'assets',
    label: 'Asset Management',
    description: 'Company assets, equipment, depreciation, custodians, and repairs.',
    icon: BriefcaseBusiness,
  },
  reviews: {
    id: 'reviews',
    label: 'Product Reviews',
    description: 'Customer reviews, moderation, approval, and merchant replies.',
    icon: HeartHandshake,
  },
  media: {
    id: 'media',
    label: 'Media Library',
    description: 'Product photos, documents, uploads, tags, and media organization.',
    icon: Image,
  },
  sizing: {
    id: 'sizing',
    label: 'Sizing & Measurements',
    description: 'Size guides, size definitions, measurement systems, and fit charts.',
    icon: Ruler,
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics & Projections',
    description: 'Sales analytics, inventory turnover, customer trends, and reports.',
    icon: ChartNoAxesCombined,
  },
  notifications: {
    id: 'notifications',
    label: 'Notifications & Email',
    description: 'Email policies, notification templates, dispatch, and suppression.',
    icon: Bell,
  },
  integrations: {
    id: 'integrations',
    label: 'Integrations & Webhooks',
    description: 'External courier and payment integrations, webhook secrets.',
    icon: Plug,
  },
  admin: {
    id: 'admin',
    label: 'Operations & Integrity',
    description: 'Operational alerts, system health, and database integrity audits.',
    icon: ShieldCheck,
  },
  iam: {
    id: 'iam',
    label: 'Team & Access Governance',
    description: 'Team members, capability grants, location scopes, and invitations.',
    icon: UserRoundCog,
  },
};

export function getDomainMeta(domain: string): DomainMeta {
  const normalized = domain.toLowerCase();
  return (
    DOMAIN_CATALOG[normalized] ?? {
      id: normalized,
      label: normalized.charAt(0).toUpperCase() + normalized.slice(1).replaceAll('_', ' '),
      description: `Capabilities for the ${normalized} domain.`,
      icon: Activity,
    }
  );
}

export function groupCapabilitiesByDomain(
  capabilities: readonly CapabilityCatalogItemDto[],
): readonly { readonly domain: DomainMeta; readonly capabilities: readonly CapabilityCatalogItemDto[] }[] {
  const grouped = new Map<string, CapabilityCatalogItemDto[]>();

  for (const capability of capabilities) {
    if (capability.status === 'DEPRECATED') continue;
    const key = capability.domain.toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(capability);
    grouped.set(key, list);
  }

  const result: { domain: DomainMeta; capabilities: CapabilityCatalogItemDto[] }[] = [];
  for (const [key, items] of grouped.entries()) {
    items.sort((a, b) => a.capability_code.localeCompare(b.capability_code));
    result.push({
      domain: getDomainMeta(key),
      capabilities: items,
    });
  }

  result.sort((a, b) => a.domain.label.localeCompare(b.domain.label));
  return result;
}

export function getSensitivityBadge(sensitivity: CapabilitySensitivityDto): {
  label: string;
  className: string;
} {
  switch (sensitivity) {
    case 'RESTRICTED':
      return { label: 'Restricted', className: 'status-danger' };
    case 'CRITICAL':
      return { label: 'Critical', className: 'status-warning' };
    case 'HIGH':
      return { label: 'High impact', className: 'status-info' };
    case 'INTERNAL':
    default:
      return { label: 'Standard', className: 'status-neutral' };
  }
}

export function getRoleSummary(
  capabilities: readonly string[],
  presets: readonly PermissionPresetDto[],
  membershipType: MembershipTypeDto,
): string {
  if (membershipType === 'OWNER') return 'Owner (Full Access)';
  if (!capabilities.length) return 'No capabilities granted';

  // Check if exactly matches a preset
  const targetSet = new Set(capabilities);
  for (const preset of presets) {
    if (
      preset.capability_codes.length === targetSet.size &&
      preset.capability_codes.every((code) => targetSet.has(code))
    ) {
      return preset.name;
    }
  }

  // Check if contains a preset
  for (const preset of presets) {
    if (
      preset.capability_codes.length > 0 &&
      preset.capability_codes.every((code) => targetSet.has(code))
    ) {
      const extra = targetSet.size - preset.capability_codes.length;
      return extra > 0 ? `${preset.name} (+${extra})` : preset.name;
    }
  }

  return `Custom access (${capabilities.length} capabilities)`;
}

export function formatAuditAction(action: string): {
  title: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
} {
  switch (action) {
    case 'iam.invitation.created':
      return { title: 'Invitation Created', tone: 'neutral' };
    case 'iam.invitation.resent':
      return { title: 'Invitation Resent', tone: 'neutral' };
    case 'iam.invitation.revoked':
      return { title: 'Invitation Revoked', tone: 'warning' };
    case 'iam.invitation.accepted':
      return { title: 'Invitation Accepted', tone: 'success' };
    case 'iam.membership.permissions_replaced':
      return { title: 'Permissions Changed', tone: 'neutral' };
    case 'iam.membership.suspended':
      return { title: 'Member Suspended', tone: 'danger' };
    case 'iam.membership.restored':
      return { title: 'Member Reactivated', tone: 'success' };
    case 'iam.membership.removed':
      return { title: 'Member Removed', tone: 'danger' };
    case 'iam.organization.owner_transferred':
      return { title: 'Ownership Transferred', tone: 'warning' };
    case 'iam.organization.owner_created':
      return { title: 'Owner Initialized', tone: 'success' };
    case 'iam.membership.sessions_revocation_requested':
      return { title: 'Sessions Revoked', tone: 'warning' };
    case 'iam.preset.created':
      return { title: 'Role Preset Created', tone: 'success' };
    case 'iam.preset.updated':
      return { title: 'Role Preset Updated', tone: 'neutral' };
    case 'iam.preset.deleted':
      return { title: 'Role Preset Deleted', tone: 'warning' };
    default:
      return {
        title: action.replace(/^iam\./, '').replaceAll('_', ' '),
        tone: 'neutral',
      };
  }
}

export function formatIamErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes('OWNER_PROTECTED')) {
      return 'Owner access is structural and protected. Use the Ownership Transfer workflow to change the organization Owner.';
    }
    if (message.includes('SELF_CHANGE_FORBIDDEN')) {
      return 'You cannot modify your own lifecycle status, revoke your own sessions, or alter your own permissions.';
    }
    if (message.includes('STEP_UP_REQUIRED')) {
      return 'A fresh two-factor (MFA) authenticated session from the past 10 minutes is required for this operation.';
    }
    if (message.includes('VERSION_CONFLICT')) {
      return 'The record was modified concurrently by another administrator. Please refresh and review the updated state.';
    }
    if (message.includes('CONFLICT') && message.includes('already has an active membership')) {
      return 'This person is already an active member of this organization.';
    }
    if (message.includes('CONFLICT') && message.includes('pending invitation already exists')) {
      return 'A pending invitation already exists for this email address.';
    }
    if (message.includes('INVITATION_EXPIRED')) {
      return 'This invitation has expired and can no longer be used.';
    }
    if (message.includes('INVITATION_REVOKED')) {
      return 'This invitation was revoked by an administrator.';
    }
    if (message.includes('INVITATION_INVALID')) {
      return 'The invitation link is invalid or incomplete.';
    }
    if (message.includes('FORBIDDEN')) {
      return 'You do not have the required administrative capability to perform this action.';
    }
    return message;
  }
  return 'The team operation could not be completed.';
}
