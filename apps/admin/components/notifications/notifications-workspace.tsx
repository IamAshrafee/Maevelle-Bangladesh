'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, MessageSquare, Webhook, Edit3, Settings, PlayCircle, Eye, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/input';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());

export function NotificationsWorkspace({
  notifications,
  reload
}: {
  notifications: any[],
  reload: () => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState('queue');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('Welcome {{customer.name}}, your order #{{order.number}} is confirmed.');
  const [renderedPreview, setRenderedPreview] = useState('Welcome Jane Doe, your order #ORD-12345 is confirmed.');

  const templates = [
    { id: 't1', name: 'Order Created', channel: 'EMAIL', active: true },
    { id: 't2', name: 'Return Approved', channel: 'SMS', active: true },
    { id: 't3', name: 'Shipment Arrived', channel: 'WEBHOOK', active: false },
    { id: 't4', name: 'Password Reset', channel: 'EMAIL', active: true },
  ];

  const handleTemplateEdit = (id: string) => {
    setSelectedTemplate(id);
    setActiveTab('editor');
  };

  const handlePreviewUpdate = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPreviewText(text);
    // Simple mock render
    setRenderedPreview(
      text.replace('{{customer.name}}', 'Jane Doe')
          .replace('{{order.number}}', 'ORD-12345')
    );
  };

  const saveTemplate = () => {
    toast.success('Template saved successfully.');
    setSelectedTemplate(null);
    setActiveTab('templates');
  };

  const markRead = async (id: string) => {
    try {
      await request(`/api/admin/notifications/${id}/read`, { method: 'POST' });
      await reload();
      toast.success('Marked as read');
    } catch {
      toast.error('Failed to mark read');
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
        <TabsList className="mb-4 w-fit">
          <TabsTrigger value="queue" className="gap-2"><Inbox className="w-4 h-4" /> Message Queue</TabsTrigger>
          <TabsTrigger value="templates" className="gap-2"><Settings className="w-4 h-4" /> Triggers & Templates</TabsTrigger>
          {selectedTemplate && <TabsTrigger value="editor" className="gap-2"><Edit3 className="w-4 h-4" /> Template Editor</TabsTrigger>}
        </TabsList>

        <div className="flex-1 overflow-y-auto pb-8">
          <TabsContent value="queue" className="mt-0 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Delivery Queue</CardTitle>
                <CardDescription>Live feed of all system-generated messages</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map(n => (
                      <TableRow key={n.id}>
                        <TableCell className="font-medium">{n.notification_type}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="flex w-fit items-center gap-1">
                            {n.channel === 'EMAIL' && <Mail className="w-3 h-3" />}
                            {n.channel === 'SMS' && <MessageSquare className="w-3 h-3" />}
                            {n.channel === 'IN_APP' && <Inbox className="w-3 h-3" />}
                            {n.channel === 'WEBHOOK' && <Webhook className="w-3 h-3" />}
                            {n.channel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            n.status === 'SENT' ? 'success' : 
                            n.status === 'FAILED' ? 'destructive' : 
                            n.status === 'READ' ? 'secondary' : 'warning' as any
                          }>
                            {n.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[200px]">{n.rendered_body}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          {n.channel === 'IN_APP' && n.status !== 'READ' && (
                            <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark Read</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {notifications.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No messages in queue.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Event Triggers & Templates</CardTitle>
                <CardDescription>Configure how the system communicates when core domain events occur.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trigger Event</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="flex w-fit items-center gap-1">
                            {t.channel === 'EMAIL' && <Mail className="w-3 h-3" />}
                            {t.channel === 'SMS' && <MessageSquare className="w-3 h-3" />}
                            {t.channel === 'WEBHOOK' && <Webhook className="w-3 h-3" />}
                            {t.channel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {t.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Disabled</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => handleTemplateEdit(t.id)}>
                            <Edit3 className="w-4 h-4 mr-2" /> Edit Template
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="editor" className="mt-0">
            <div className="grid grid-cols-2 gap-6 h-full">
              <Card className="h-[500px] flex flex-col">
                <CardHeader>
                  <CardTitle>Template Source</CardTitle>
                  <CardDescription>Use Liquid-style syntax for variables (e.g., {'{{customer.name}}'})</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject / Title</label>
                    <Input defaultValue="Order Confirmation: {{order.number}}" />
                  </div>
                  <div className="space-y-2 flex-1 flex flex-col">
                    <label className="text-sm font-medium">Body</label>
                    <textarea 
                      className="w-full flex-1 p-3 text-sm font-mono rounded-md border bg-card"
                      value={previewText}
                      onChange={handlePreviewUpdate}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => { setSelectedTemplate(null); setActiveTab('templates'); }}>Cancel</Button>
                    <Button onClick={saveTemplate}>Save Changes</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="h-[500px] flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Eye className="w-4 h-4" /> Live Preview</CardTitle>
                  <CardDescription>How the recipient will see this message</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="w-full h-full border rounded-lg p-6 bg-muted/10">
                    <div className="max-w-md mx-auto bg-background border shadow-sm rounded-lg overflow-hidden">
                      <div className="bg-muted p-3 border-b text-sm font-medium">
                        Order Confirmation: ORD-12345
                      </div>
                      <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap">
                        {renderedPreview}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
