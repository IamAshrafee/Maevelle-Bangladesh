'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, Laptop, LogOut, ShieldCheck, User, UserRoundCog } from 'lucide-react';
import type { AdminContextDto } from '@maevelle/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/status-badge';
import { getInitials } from './account/account-utils';

interface UserMenuProps {
  readonly context?: AdminContextDto | undefined;
  readonly onLogout: () => void | Promise<void>;
  readonly defaultOpen?: boolean | undefined;
}

export function UserMenu({ context, onLogout, defaultOpen }: UserMenuProps) {
  const userName = context?.user?.name || 'Maevelle Operator';
  const userEmail = context?.user?.email || '';
  const userImage = context?.user?.image;
  const initials = getInitials(userName);

  const roleLabel =
    context?.membershipType === 'OWNER'
      ? 'Owner'
      : context?.membershipType === 'STANDARD'
        ? 'Team Member'
        : 'Operator';

  const is2faEnabled = context?.twoFactor?.isEnabled ?? false;

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`User menu for ${userName}`}
      >
        {userImage ? (
          <img
            src={userImage}
            alt={userName}
            className="size-7 sm:size-8 rounded-full object-cover border border-primary/30 shrink-0"
          />
        ) : (
          <div
            className="size-7 sm:size-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs border border-primary/25 shrink-0 select-none"
            aria-hidden="true"
          >
            {initials ? initials : <User className="size-3.5" />}
          </div>
        )}

        <div className="hidden md:flex flex-col items-start leading-tight text-left min-w-0 max-w-[130px]">
          <strong className="text-xs font-semibold text-foreground truncate w-full">
            {userName}
          </strong>
          <small className="text-[10px] text-muted-foreground truncate w-full">
            {roleLabel} · Maevelle BD
          </small>
        </div>

        <ChevronDown
          className="size-3 text-muted-foreground group-hover:text-foreground transition-colors duration-150 hidden sm:block shrink-0"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-1.5 shadow-lg border border-border bg-card">
        {/* Header summary */}
        <DropdownMenuLabel className="p-2 font-normal">
          <div className="flex items-center gap-3">
            {userImage ? (
              <img
                src={userImage}
                alt={userName}
                className="size-10 rounded-full object-cover border border-primary/30 shrink-0"
              />
            ) : (
              <div
                className="size-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm border border-primary/25 shrink-0 select-none"
                aria-hidden="true"
              >
                {initials ? initials : <User className="size-5" />}
              </div>
            )}
            <div className="space-y-0.5 min-w-0 flex-1">
              <strong className="text-xs font-semibold text-foreground block truncate">
                {userName}
              </strong>
              {userEmail ? (
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {userEmail}
                </p>
              ) : null}
              <div className="pt-0.5">
                <span className="inline-block text-[10px] font-medium text-foreground/80 bg-muted/70 border border-border px-1.5 py-0.2 rounded">
                  {roleLabel} · Maevelle Bangladesh
                </span>
              </div>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Account Quick Links */}
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={<Link href="/account" className="flex items-center gap-2.5 w-full cursor-pointer py-1.5 px-2 text-xs" />}
          >
            <UserRoundCog className="size-4 text-primary shrink-0" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="font-medium text-foreground">My Account</span>
              <span className="text-[10px] text-muted-foreground">Personal profile & settings</span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            render={<Link href="/account?tab=security" className="flex items-center justify-between gap-2.5 w-full cursor-pointer py-1.5 px-2 text-xs" />}
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 text-primary shrink-0" aria-hidden="true" />
              <span className="font-medium text-foreground">Account Security</span>
            </div>
            <StatusBadge
              status={is2faEnabled ? '2FA ON' : '2FA OFF'}
              tone={is2faEnabled ? 'success' : 'warning'}
            />
          </DropdownMenuItem>

          <DropdownMenuItem
            render={<Link href="/account?tab=sessions" className="flex items-center gap-2.5 w-full cursor-pointer py-1.5 px-2 text-xs" />}
          >
            <Laptop className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="font-medium text-foreground">Active Sessions</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Sign Out */}
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void onLogout()}
          className="flex items-center gap-2.5 w-full cursor-pointer py-1.5 px-2 text-xs text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
