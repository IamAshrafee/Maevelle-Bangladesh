'use client';

import React, { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { Worklist, WorklistToolbar } from '@/components/ui/worklist';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Truck, CheckCircle2, AlertTriangle, ChevronRight, XCircle } from 'lucide-react';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

interface Delivery {
  id: string;
  version: number;
  deliveryNumber: string;
  orderNumber: string;
  fulfillmentNumber: string;
  operationalStatus:
    'READY' | 'BOOKED' | 'HANDED_OVER' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
  outcomeStatus: string;
  recipient: { name: string; phone: string; address: string };
  manualCarrierName?: string;
  trackingReference?: string;
  events: readonly { type: string; occurredAt: string }[];
}

const COURIERS = ['Pathao', 'Steadfast', 'RedX', 'eCourier', 'Paperfly', 'Own Fleet'];

export function DeliveryConsole() {
  const [deliveries, setDeliveries] = useState<readonly Delivery[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [carrierName, setCarrierName] = useState('');
  const [trackingReference, setTrackingReference] = useState('');

  const reload = async () => {
    try {
      setDeliveries((await request<ApiEnvelope<readonly Delivery[]>>('/api/admin/deliveries')).data);
    } catch {
      toast.error('Unable to load deliveries. Sign in with delivery permission.');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const simple = async (delivery: Delivery, action: 'dispatch' | 'delivered' | 'failed') => {
    try {
      const body =
        action === 'failed'
          ? { version: delivery.version, reasonCode: 'MANUAL_DELIVERY_FAILURE' }
          : { version: delivery.version };
      await request(`/api/admin/deliveries/${delivery.id}/${action}`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      toast.success(`Delivery marked as ${action}`);
      await reload();
    } catch {
      toast.error('The delivery state could not be updated. Reload and try again.');
    }
  };

  const book = async (delivery: Delivery) => {
    if (!carrierName || !trackingReference) {
      toast.error('Carrier and tracking reference are required.');
      return;
    }
    try {
      await request(`/api/admin/deliveries/${delivery.id}/manual-booking`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version: delivery.version,
          carrierName,
          trackingReference,
        }),
      });
      toast.success('Manual courier booking recorded.');
      setCarrierName('');
      setTrackingReference('');
      await reload();
    } catch {
      toast.error('Manual courier booking could not be recorded.');
    }
  };

  const selectedDelivery = deliveries.find(d => d.id === selectedId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY': return 'secondary';
      case 'BOOKED': return 'default';
      case 'IN_TRANSIT': return 'warning';
      case 'DELIVERED': return 'success';
      case 'FAILED': return 'destructive';
      case 'CANCELLED': return 'outline';
      default: return 'outline';
    }
  };

  const renderStepper = (status: string) => {
    const steps = [
      { id: 'READY', label: 'Ready', icon: Package },
      { id: 'BOOKED', label: 'Booked', icon: CheckCircle2 },
      { id: 'IN_TRANSIT', label: 'In Transit', icon: Truck },
      { id: 'DELIVERED', label: 'Delivered', icon: CheckCircle2 },
    ];

    let currentIndex = steps.findIndex(s => s.id === status);
    if (status === 'FAILED' || status === 'CANCELLED') currentIndex = 2; // Show failed after transit

    return (
      <div className="flex items-center justify-between w-full mt-4 mb-8 relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-muted -z-10 -translate-y-1/2 rounded"></div>
        <div 
          className="absolute top-1/2 left-0 h-1 bg-primary -z-10 -translate-y-1/2 transition-all rounded" 
          style={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
        ></div>
        
        {steps.map((step, index) => {
          const isActive = index <= currentIndex;
          const isError = index === currentIndex && (status === 'FAILED' || status === 'CANCELLED');
          const Icon = isError ? (status === 'FAILED' ? AlertTriangle : XCircle) : step.icon;
          
          return (
            <div key={step.id} className="flex flex-col items-center bg-card px-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                isActive 
                  ? (isError ? 'bg-destructive border-destructive text-destructive-foreground' : 'bg-primary border-primary text-primary-foreground') 
                  : 'bg-background border-muted text-muted-foreground'
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-xs mt-2 font-medium ${isActive ? (isError ? 'text-destructive' : 'text-foreground') : 'text-muted-foreground'}`}>
                {isError ? status : step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${selectedId ? 'mr-[450px]' : ''}`}>
        <div className="p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Deliveries</h1>
            <p className="text-muted-foreground mb-6">Manage final-mile courier bookings and tracking.</p>
          </div>
          
          <WorklistProvider>
            <WorklistToolbar>
              <WorklistSearch placeholder="Search delivery or order number..." />
              <WorklistFilters options={['READY', 'BOOKED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED']} />
            </WorklistToolbar>
            
            <div className="mt-4 rounded-md border bg-card">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-medium">Delivery #</th>
                    <th className="px-6 py-3 font-medium">Order</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Recipient</th>
                    <th className="px-6 py-3 font-medium">Carrier</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                        No deliveries found.
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((d) => (
                      <tr 
                        key={d.id} 
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === d.id ? 'bg-muted/50' : ''}`}
                        onClick={() => setSelectedId(d.id)}
                      >
                        <td className="px-6 py-4 font-medium">{d.deliveryNumber}</td>
                        <td className="px-6 py-4 text-muted-foreground">{d.orderNumber}</td>
                        <td className="px-6 py-4">
                          <Badge variant={getStatusColor(d.operationalStatus) as any}>{d.operationalStatus}</Badge>
                        </td>
                        <td className="px-6 py-4 truncate max-w-[200px]">{d.recipient.name}</td>
                        <td className="px-6 py-4 text-muted-foreground">{d.manualCarrierName || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </WorklistProvider>
        </div>
      </div>

      {selectedDelivery && (
        <aside className="fixed top-16 right-0 w-[450px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <h3 className="font-semibold text-xl">{selectedDelivery.deliveryNumber}</h3>
              <div className="flex gap-2 text-sm text-muted-foreground mt-1">
                <span>Order {selectedDelivery.orderNumber}</span>
                <span>•</span>
                <span>Fulfillment {selectedDelivery.fulfillmentNumber}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6 space-y-8 flex-1">
            
            <div>
              {renderStepper(selectedDelivery.operationalStatus)}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recipient Details</h4>
              <div className="bg-muted/30 p-4 rounded-lg border text-sm space-y-1">
                <p className="font-medium">{selectedDelivery.recipient.name}</p>
                <p>{selectedDelivery.recipient.phone}</p>
                <p className="text-muted-foreground mt-2">{selectedDelivery.recipient.address}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Courier Information</h4>
              {selectedDelivery.operationalStatus === 'READY' ? (
                <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Carrier</label>
                    <Select value={carrierName} onValueChange={setCarrierName}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a courier..." />
                      </SelectTrigger>
                      <SelectContent>
                        {COURIERS.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tracking Reference</label>
                    <Input 
                      placeholder="e.g. TRK-123456789" 
                      value={trackingReference} 
                      onChange={e => setTrackingReference(e.target.value)} 
                    />
                  </div>
                  <Button className="w-full" onClick={() => book(selectedDelivery)}>
                    Record Booking
                  </Button>
                </div>
              ) : (
                <div className="bg-muted/30 p-4 rounded-lg border text-sm flex justify-between items-center">
                  <div>
                    <p className="font-medium">{selectedDelivery.manualCarrierName || 'Unknown Carrier'}</p>
                    <p className="text-muted-foreground mt-1 font-mono text-xs">{selectedDelivery.trackingReference || 'No tracking reference'}</p>
                  </div>
                  <Badge variant="outline">Booked</Badge>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h4>
              <div className="space-y-3">
                {selectedDelivery.events.map((event, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="mt-1"><ChevronRight className="w-4 h-4 text-muted-foreground" /></div>
                    <div>
                      <p className="font-medium capitalize">{event.type.replace(/_/g, ' ').toLowerCase()}</p>
                      <p className="text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
          </div>

          {selectedDelivery.operationalStatus !== 'READY' && selectedDelivery.operationalStatus !== 'DELIVERED' && selectedDelivery.operationalStatus !== 'FAILED' && selectedDelivery.operationalStatus !== 'CANCELLED' && (
            <div className="p-4 border-t bg-muted/10 space-y-2 sticky bottom-0">
              {selectedDelivery.operationalStatus === 'BOOKED' && (
                <Button className="w-full" onClick={() => simple(selectedDelivery, 'dispatch')}>
                  Hand Over to Courier
                </Button>
              )}
              {selectedDelivery.operationalStatus === 'IN_TRANSIT' && (
                <div className="flex gap-2">
                  <Button className="w-full" variant="default" onClick={() => simple(selectedDelivery, 'delivered')}>
                    Mark Delivered
                  </Button>
                  <Button className="w-full" variant="destructive" onClick={() => simple(selectedDelivery, 'failed')}>
                    Mark Failed
                  </Button>
                </div>
              )}
            </div>
          )}
        </aside>
      )}
    </main>
  );
}

function WorklistProvider({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
