'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface BarcodeScannerModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onScan: (barcode: string) => void;
  readonly title?: string;
}

export function BarcodeScannerModal({
  open,
  onOpenChange,
  onScan,
  title = 'Scan Product Barcode',
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [detectorSupported, setDetectorSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCameraError(null);
      setManualCode('');
      setScanning(false);
      return;
    }

    const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    setDetectorSupported(hasDetector);

    let active = true;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not supported by your browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setScanning(true);
        }
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof Error
            ? err.name === 'NotAllowedError'
              ? 'Camera permission was denied. Please allow camera access in your browser settings.'
              : err.message
            : 'Unable to start camera.';
        setCameraError(msg);
      }
    }

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [open]);

  // Barcode detection loop
  useEffect(() => {
    if (!open || !scanning || !detectorSupported) return;

    let timerId: NodeJS.Timeout | null = null;
    let cancelled = false;

    try {
      // @ts-expect-error - BarcodeDetector is a modern browser web API
      const barcodeDetector = new window.BarcodeDetector({
        formats: ['ean_13', 'code_128', 'upc_a', 'qr_code'],
      });

      const detectFrame = async () => {
        if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
          if (!cancelled) timerId = setTimeout(detectFrame, 250);
          return;
        }

        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0 && barcodes[0]?.rawValue) {
            const code = barcodes[0].rawValue.trim();
            if (code) {
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try {
                  navigator.vibrate(80);
                } catch {
                  // ignore vibration failure
                }
              }
              onScan(code);
              onOpenChange(false);
              return;
            }
          }
        } catch {
          // Frame error, continue polling
        }

        if (!cancelled) {
          timerId = setTimeout(detectFrame, 200);
        }
      };

      timerId = setTimeout(detectFrame, 400);
    } catch {
      setDetectorSupported(false);
    }

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [open, scanning, detectorSupported, onScan, onOpenChange]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  const handleManualSubmit = () => {
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    onScan(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-4 space-y-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Camera className="size-4 text-primary" />
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Point your device camera at an EAN-13, Code 128, or UPC barcode on the physical garment tag.
          </DialogDescription>
        </DialogHeader>

        {/* Video Viewport */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black flex items-center justify-center">
          {cameraError ? (
            <div className="p-4 text-center text-xs text-destructive space-y-2">
              <AlertCircle className="size-6 mx-auto" />
              <p>{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="size-full object-cover"
              />
              {/* Reticle Overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="size-48 rounded-lg border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              </div>
            </>
          )}
        </div>

        {detectorSupported === false && (
          <p className="text-[11px] text-warning">
            Real-time automatic barcode recognition is not enabled in this browser. Enter the code below.
          </p>
        )}

        {/* Manual Barcode Fallback */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <Input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Or type barcode manually…"
            className="h-9 text-xs font-mono"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleManualSubmit();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleManualSubmit}
            disabled={!manualCode.trim()}
            className="h-9 px-3 text-xs"
          >
            <Check className="size-3.5 mr-1" />
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
