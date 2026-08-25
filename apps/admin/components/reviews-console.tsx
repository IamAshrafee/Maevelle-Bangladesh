'use client';

import React, { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { Worklist, WorklistToolbar } from '@/components/ui/worklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };
import { Star, MessageSquare, AlertTriangle, ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Review = {
  readonly id: string;
  readonly product_id: string;
  readonly revision_id: string;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string | null;
  readonly submitted_at: string;
  readonly status: 'PENDING' | 'APPROVED' | 'REJECTED';
  readonly has_images?: boolean;
};

const rejectionReasons = [
  'SPAM',
  'DUPLICATE',
  'IRRELEVANT',
  'ABUSIVE_OR_THREATENING',
  'PERSONAL_INFORMATION',
  'UNSAFE_MEDIA',
  'FRAUD_SUSPECTED',
  'PROHIBITED_CONTENT',
  'OTHER',
] as const;

export function ReviewsConsole() {
  const [reviews, setReviews] = useState<readonly Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState<(typeof rejectionReasons)[number]>('SPAM');
  const [replyText, setReplyText] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      setReviews((await request<ApiEnvelope<readonly Review[]>>('/api/admin/reviews')).data);
    } catch {
      toast.error('Unable to load reviews. Sign in with Review moderation permission.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const selected = reviews.find(r => r.id === selectedId);

  const moderate = async (review: Review, decision: 'APPROVE' | 'REJECT') => {
    try {
      await request(`/api/admin/reviews/${review.id}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
          revisionId: review.revision_id,
          decision,
          ...(decision === 'REJECT' ? { reason } : {}),
        }),
      });
      toast.success(decision === 'APPROVE' ? 'Review published.' : 'Review rejected for policy violation.');
      await reload();
      setSelectedId(null);
    } catch {
      toast.error('Moderation failed. Negative sentiment alone is never a rejection reason.');
    }
  };

  const respond = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !replyText) return;
    try {
      await request(`/api/admin/reviews/${selected.id}/response`, {
        method: 'POST',
        body: JSON.stringify({ body: replyText }),
      });
      toast.success('Merchant response saved.');
      setReplyText('');
    } catch {
      toast.error('Merchant response was rejected.');
    }
  };

  const flagUser = () => {
    toast.success('User flagged for investigation.');
  };

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      <div className={`flex-1 flex flex-col min-w-0 transition-all p-6 ${selectedId ? 'mr-[500px]' : ''}`}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Review Moderation</h1>
          <p className="text-muted-foreground mb-6">
            Approve genuine customer feedback or reject for specific policy violations.
          </p>
        </div>

        <WorklistProvider>
          <WorklistToolbar>
            <WorklistSearch placeholder="Search reviews..." />
            <WorklistFilters options={['PENDING', 'APPROVED', 'REJECTED']} />
          </WorklistToolbar>

          <div className="mt-4 rounded-md border bg-card">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-3 font-medium">Rating</th>
                  <th className="px-6 py-3 font-medium">Title</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Media</th>
                  <th className="px-6 py-3 font-medium text-right">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No Reviews in queue.
                    </td>
                  </tr>
                ) : (
                  reviews.map(r => (
                    <tr 
                      key={r.id} 
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === r.id ? 'bg-muted/50' : ''}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`w-4 h-4 ${i < r.rating ? 'fill-current' : 'text-muted'}`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium">{r.title || 'Untitled'}</td>
                      <td className="px-6 py-4">
                        <Badge variant={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'destructive' : 'warning' as any}>
                          {r.status || 'PENDING'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {r.has_images ? <Badge variant="secondary">Images</Badge> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-6 py-4 text-right text-muted-foreground">
                        {new Date(r.submitted_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </WorklistProvider>
      </div>

      {selected && (
        <aside className="fixed top-16 right-0 w-[500px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <div className="flex text-amber-500 mb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-5 h-5 ${i < selected.rating ? 'fill-current' : 'text-muted'}`} />
                ))}
              </div>
              <h3 className="font-semibold text-xl">{selected.title || 'Untitled Review'}</h3>
              <p className="text-xs text-muted-foreground mt-1">Submitted: {new Date(selected.submitted_at).toLocaleString()}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6 flex-1">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Review Body</h4>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {selected.body || <span className="italic text-muted-foreground">No written text provided.</span>}
              </p>
            </div>

            {selected.has_images && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Attached Media</h4>
                <div className="flex gap-2">
                  <div className="w-24 h-24 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">Image 1</div>
                  <div className="w-24 h-24 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">Image 2</div>
                </div>
              </div>
            )}

            <div className="border-t pt-6 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Moderation Actions</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <Button className="w-full bg-success hover:bg-success/90" onClick={() => moderate(selected, 'APPROVE')}>
                  <CheckCircle className="w-4 h-4 mr-2" /> Approve
                </Button>
                
                <div className="space-y-2 flex flex-col">
                  <Select value={reason} onValueChange={(v: any) => setReason(v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rejectionReasons.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="destructive" className="w-full" onClick={() => moderate(selected, 'REJECT')}>
                    <XCircle className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </div>
              </div>

              <div className="pt-4 flex justify-between items-center border-t border-dashed">
                <span className="text-sm text-muted-foreground">Suspect fraud or abuse?</span>
                <Button variant="outline" size="sm" onClick={flagUser} className="text-warning border-warning/50">
                  <ShieldAlert className="w-4 h-4 mr-2" /> Flag User
                </Button>
              </div>
            </div>

            <div className="border-t pt-6 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Merchant Response
              </h4>
              <form onSubmit={respond} className="space-y-3">
                <textarea 
                  className="w-full min-h-[100px] p-3 text-sm rounded-md border bg-card"
                  placeholder="Type a public response to this review..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  required
                />
                <Button type="submit" variant="secondary" className="w-full">Post Response</Button>
              </form>
            </div>

          </div>
        </aside>
      )}
    </main>
  );
}

function WorklistProvider({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
