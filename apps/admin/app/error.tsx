'use client';

import * as React from 'react';
import { useEffect } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Log error to console for operator diagnostics
    console.error('Admin portal runtime error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4 border border-destructive/20 shadow-2xs">
        <AlertCircle className="size-6" />
      </div>
      <h2 className="text-lg font-bold text-foreground mb-1">
        This workspace view could not load
      </h2>
      <p className="text-xs text-muted-foreground max-w-md mb-6 leading-relaxed">
        An unexpected error occurred while loading this view. You can retry loading or return to the main dashboard.
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => reset()}
          className="gap-2 cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
          Try again
        </Button>
        <Button
          variant="default"
          onClick={() => {
            window.location.href = '/admin';
          }}
          className="cursor-pointer"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
