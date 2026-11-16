'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toAppRoutePath } from '@/lib/navigation/route-registry';

export interface UseUnsavedChangesGuardOptions {
  readonly when: boolean;
  readonly message?: string;
}

/**
 * Protects dirty forms against accidental tab close (`beforeunload`) and internal
 * anchor/Next.js `<Link>` navigation when `when` is true.
 */
export function useUnsavedChangesGuard({
  when,
  message = 'You have unsaved changes. Leave this page without saving?',
}: UseUnsavedChangesGuardOptions) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!when) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor) return;
      if (anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;

      const rawHref = anchor.getAttribute('href');
      if (
        !rawHref ||
        rawHref.startsWith('#') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:')
      ) {
        return;
      }

      try {
        const nextUrl = new URL(
          anchor instanceof HTMLAnchorElement ? anchor.href : rawHref,
          window.location.href,
        );
        if (nextUrl.origin !== window.location.origin) return;
        const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const nextFull = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
        if (currentFull === nextFull) return;

        event.preventDefault();
        event.stopPropagation();
        setPendingHref(toAppRoutePath(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`));
      } catch {
        // Ignore malformed URLs
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [when]);

  const confirmNavigation = useCallback(() => {
    if (!pendingHref) return;
    const dest = pendingHref;
    setPendingHref(null);
    router.push(dest);
  }, [pendingHref, router]);

  const cancelNavigation = useCallback(() => {
    setPendingHref(null);
  }, []);

  const guardDialog = (
    <AlertDialog open={Boolean(pendingHref)} onOpenChange={(open) => !open && cancelNavigation()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelNavigation}>Stay on page</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmNavigation}>
            Discard &amp; leave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    pendingHref,
    isPromptOpen: Boolean(pendingHref),
    confirmNavigation,
    cancelNavigation,
    guardDialog,
  };
}
