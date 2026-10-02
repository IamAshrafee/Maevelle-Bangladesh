'use client';

import { useState, type FormEvent } from 'react';
import { FileText, UploadCloud } from 'lucide-react';
import type { AssetDetailDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { AssetPickerDialog, type SelectedMediaAsset } from '@/components/media/asset-picker-dialog';
import { fetchApiData } from '@/lib/api';
import { newIdempotencyKey } from '@/lib/assets/format';

interface AssetAttachMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailDto;
  onSuccess: () => void;
}

export function AssetAttachMediaDialog({
  open,
  onOpenChange,
  asset,
  onSuccess,
}: AssetAttachMediaDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaAsset>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMedia) {
      setError('Please choose or upload a media file first.');
      return;
    }
    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    const body = {
      mediaAssetId: selectedMedia.id,
      role: String(form.get('role')),
      label: String(form.get('label')).trim() || undefined,
      idempotencyKey: newIdempotencyKey('asset-media'),
    };

    try {
      await fetchApiData(`/admin/assets/${asset.id}/media`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSelectedMedia(undefined);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Media could not be attached.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              <span>Attach Private Document or Photo</span>
            </DialogTitle>
            <DialogDescription>
              Attach invoices, warranty certificates, repair receipts, or serial number photos.
              Documents remain private to authorized organization members.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
              {error}
            </div>
          ) : null}

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">Media File</span>
              {selectedMedia ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                  <div className="min-w-0 pr-2">
                    <strong className="text-sm font-semibold truncate block">
                      {selectedMedia.filename}
                    </strong>
                    <span className="text-xs text-muted-foreground">Ready to attach</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center h-20 border-dashed gap-2"
                  onClick={() => setPickerOpen(true)}
                >
                  <UploadCloud className="size-5 text-muted-foreground" />
                  <span>Choose from Library or Upload</span>
                </Button>
              )}
            </div>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Document Role / Purpose
              <NativeSelect name="role" defaultValue="PHOTO">
                <option value="PHOTO">Physical Photo</option>
                <option value="PURCHASE_RECEIPT">Purchase Receipt</option>
                <option value="INVOICE">Vendor Invoice</option>
                <option value="WARRANTY">Warranty Card / Policy</option>
                <option value="REPAIR_RECEIPT">Repair Receipt / Service Invoice</option>
                <option value="SERIAL_PHOTO">Serial Number / Asset Tag Photo</option>
                <option value="OTHER">Other Operational Document</option>
              </NativeSelect>
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Label / Reference Description (Optional)
              <Input name="label" placeholder="e.g. Original Purchase Bill, 3-Year Warranty Slip" />
            </Label>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !selectedMedia}>
                {busy ? 'Attaching…' : 'Attach File'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple={false}
        visibility="PRIVATE"
        assetType="ALL"
        onSelect={(files) => {
          setSelectedMedia(files[0]);
          setPickerOpen(false);
          setError('');
        }}
      />
    </>
  );
}
