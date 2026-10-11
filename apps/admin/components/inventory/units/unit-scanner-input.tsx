'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScanBarcode, Camera, ArrowRight, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { lookupUnitByCode } from '@/lib/inventory/units';
import type { UnitBarcodeLookupDto } from '@maevelle/contracts';
import { cn } from '@/lib/utils';

export interface UnitScannerInputProps {
  readonly onUnitFound?: (result: UnitBarcodeLookupDto) => void;
  readonly onCodeScanned?: (code: string) => Promise<void> | void;
  readonly placeholder?: string;
  readonly autoFocus?: boolean;
  readonly continuous?: boolean;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly size?: 'sm' | 'default' | 'lg';
}

export function UnitScannerInput({
  onUnitFound,
  onCodeScanned,
  placeholder = 'Scan barcode or enter Unit Code (e.g. MVU-000101)…',
  autoFocus = false,
  continuous = false,
  className,
  inputClassName,
  size = 'default',
}: UnitScannerInputProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-focus support
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Handle process scanned payload
  const processCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      setLoading(true);
      setError(null);
      setSuccessCode(null);

      try {
        if (onCodeScanned) {
          await onCodeScanned(code);
        }

        if (onUnitFound) {
          const result = await lookupUnitByCode(code);
          onUnitFound(result);
        }

        setSuccessCode(code);
        setTimeout(() => setSuccessCode(null), 2500);

        if (continuous) {
          setValue('');
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `No unit found matching '${code}'`);
      } finally {
        setLoading(false);
      }
    },
    [continuous, onCodeScanned, onUnitFound],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void processCode(value);
    }
  };

  const handleClear = () => {
    setValue('');
    setError(null);
    setSuccessCode(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Camera Barcode Scanning using standard BarcodeDetector where available
  const startCamera = async () => {
    try {
      setError(null);
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // If standard BarcodeDetector is available
      if ('BarcodeDetector' in window) {
        // @ts-expect-error Standard browser BarcodeDetector API
        const detector = new window.BarcodeDetector({ formats: ['code_128', 'qr_code'] });
        const scanFrame = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const scanned = barcodes[0].rawValue;
              stopCamera();
              setValue(scanned);
              void processCode(scanned);
              return;
            }
          } catch {
            // Frame detection skipped
          }
          if (streamRef.current) {
            requestAnimationFrame(scanFrame);
          }
        };
        requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access device camera.');
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className={cn('relative w-full', className)}>
      <div className="relative flex items-center">
        <ScanBarcode
          className={cn(
            'absolute left-3 size-4 text-muted-foreground pointer-events-none transition-colors',
            loading && 'text-primary animate-pulse',
            error && 'text-destructive',
            successCode && 'text-emerald-600',
          )}
        />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={loading}
          className={cn(
            'pl-9 pr-24 font-mono text-sm tracking-tight transition-colors',
            size === 'sm' && 'h-8 text-xs',
            size === 'lg' && 'h-11 text-base',
            error && 'border-destructive focus-visible:ring-destructive',
            successCode && 'border-emerald-500 focus-visible:ring-emerald-500',
            inputClassName,
          )}
        />
        <div className="absolute right-1.5 flex items-center gap-1">
          {value ? (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              title="Clear"
            >
              <X className="size-3.5" />
            </button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={startCamera}
            className="size-7 text-muted-foreground hover:text-foreground"
            title="Scan with Camera"
          >
            <Camera className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!value.trim() || loading}
            onClick={() => void processCode(value)}
            className="h-7 px-2 text-xs"
          >
            {loading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ArrowRight className="size-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Success / Error Feedback inline */}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-destructive mt-1.5 font-medium animate-in fade-in duration-150">
          <AlertCircle className="size-3 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      {successCode ? (
        <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium animate-in fade-in duration-150">
          <CheckCircle2 className="size-3 shrink-0" />
          <span>Scanned & verified: <strong className="font-mono">{successCode}</strong></span>
        </p>
      ) : null}

      {/* Camera Preview Modal Overlay */}
      {cameraActive ? (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-xl overflow-hidden border shadow-lg flex flex-col">
            <div className="p-3 border-b flex justify-between items-center bg-muted/40">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Camera className="size-3.5 text-primary" /> Point camera at Code 128 barcode
              </span>
              <button
                type="button"
                onClick={stopCamera}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="relative aspect-4/3 bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-8 inset-y-16 border-2 border-primary/80 rounded-lg pointer-events-none animate-pulse flex items-center justify-center">
                <span className="text-[10px] text-white/90 bg-black/60 px-2 py-0.5 rounded">
                  Align Barcode Inside Box
                </span>
              </div>
            </div>
            <div className="p-3 flex justify-end gap-2 bg-muted/20 border-t">
              <Button variant="outline" size="sm" onClick={stopCamera}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
