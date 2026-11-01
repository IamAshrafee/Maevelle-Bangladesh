import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/** Populated visual reference. No browser credentials or real links are read. */
export function WishlistSharingSpecimen() {
  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-border/50 bg-surface-container-lowest p-5 shadow-xs sm:p-7">
        <h3 className="font-serif text-2xl font-semibold text-primary">Share your favorites</h3>
        <p className="mt-2 text-sm text-on-surface-variant">
          Anyone with the link can view this fixed collection until it expires or you revoke it.
        </p>
        <p className="mt-5 text-sm font-semibold text-on-surface">What would you like to share?</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-primary bg-primary-subtle p-3 text-sm">
            ◉ All eligible saved pieces
          </div>
          <div className="rounded-xl border border-border p-3 text-sm">○ Only pieces I choose</div>
        </div>
        <p className="mt-4 text-sm text-on-surface-variant">
          2 saved pieces · Link expires after 30 days
        </p>
        <Button className="mt-4">Create collection link</Button>
      </section>
      <section className="rounded-2xl border border-border/50 bg-surface-container-lowest p-5 shadow-xs sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-serif text-2xl font-semibold text-primary">Your account links</h3>
          <Badge variant="success">Active</Badge>
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">
          Each shared collection stays separate from later wishlist changes.
        </p>
        <div className="mt-5 rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">2 pieces · Active</p>
          <p className="mt-1 font-mono text-xs tabular-nums text-on-surface-variant">
            Expires 30 November 2026
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline">
              Copy link
            </Button>
            <Button size="sm" variant="ghost">
              Replace link
            </Button>
            <Button size="sm" variant="danger">
              Revoke
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
