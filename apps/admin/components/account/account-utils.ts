import * as React from 'react';
import { Laptop, Monitor, Smartphone, Tablet, Globe } from 'lucide-react';
import { ApiRequestError } from '@/lib/api';

/**
 * Extracts sensible initials for a person's display name.
 * Supports single names, multi-word names, and Unicode characters safely.
 */
export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const firstWord = parts[0];
  if (!firstWord) return '';
  if (parts.length === 1) {
    const chars = Array.from(firstWord);
    return (chars[0] ?? '').toUpperCase();
  }
  const lastWord = parts[parts.length - 1];
  const first = Array.from(firstWord)[0] ?? '';
  const last = lastWord ? Array.from(lastWord)[0] ?? '' : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Maps a parsed device category to the appropriate Lucide icon component.
 */
export function getDeviceCategoryIcon(category?: string | null): React.ElementType {
  switch (category?.toLowerCase()) {
    case 'mobile':
    case 'phone':
    case 'smartphone':
      return Smartphone;
    case 'tablet':
    case 'ipad':
      return Tablet;
    case 'desktop':
      return Monitor;
    case 'laptop':
      return Laptop;
    default:
      return Laptop;
  }
}

/**
 * Formats a relative timestamp (e.g., "Just now", "5 minutes ago", "2 hours ago").
 */
export function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return 'Unknown';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'Just now';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 90) return '1 minute ago';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minutes ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Formats a date into a localized medium date + short time string.
 */
export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Extracts a human-friendly error message from an API error or unknown error.
 */
export function getAccountErrorMessage(error: unknown, fallback: string): string {
  const code =
    error instanceof ApiRequestError
      ? error.code
      : typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;

  if (code) {
    // Map specific error codes to calm, clear copy
    switch (code) {
      case 'INVALID_CREDENTIALS':
        return 'Your current password is incorrect. Please try again.';
      case 'INVALID_NAME':
        return 'Please enter a valid display name.';
      case 'INVALID_EMAIL':
        return 'Please enter a valid email address.';
      case 'EMAIL_EXISTS':
      case 'CONFLICT':
        return 'That email address is already in use by another account.';
      case 'PASSWORD_UNCHANGED':
        return 'Your new password must be different from your current password.';
      case 'SESSION_NOT_FOUND':
        return 'This session has already ended or expired.';
      case 'CANNOT_REVOKE_CURRENT_SESSION':
        return 'You cannot revoke your active session with this button. Use Sign Out instead.';
      case 'AVATAR_TOO_LARGE':
        return 'Profile picture exceeds the 2MB size limit. Please choose a smaller file.';
      case 'INVALID_AVATAR_TYPE':
        return 'Only JPEG, PNG, and WebP images are supported.';
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a few moments before trying again.';
      default:
        break;
    }
  }

  if (error instanceof ApiRequestError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Dispatches an account-updated notification so AdminShell and topbars can
 * synchronize avatar and display name across components immediately.
 */
export function notifyAccountUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('maevelle:account-updated'));
  }
}
