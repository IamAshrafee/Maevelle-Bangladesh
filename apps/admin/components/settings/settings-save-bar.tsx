'use client';

import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion, ADMIN_MOTION } from '@/components/motion/motion-primitives';

interface SettingsSaveBarProps {
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly onSave: () => void | Promise<void>;
  readonly onDiscard: () => void;
  readonly message?: string;
  readonly className?: string;
}

export function SettingsSaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  message = 'You have unsaved configuration changes.',
  className,
}: SettingsSaveBarProps) {
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          key="settings-save-bar"
          role="region"
          data-shell-chrome="true"
          aria-label="Unsaved changes bar"
          initial={{ opacity: 0, y: 16, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 16, x: '-50%' }}
          transition={ADMIN_MOTION.fast}
          className={cn(
            'fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] md:bottom-4 left-1/2 z-50 w-[95%] max-w-2xl print:hidden',
            className,
          )}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-card text-foreground rounded-xl border border-primary/30 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <span>{message}</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDiscard}
                disabled={saving}
                className="text-xs h-8 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5 mr-1" />
                Discard
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={onSave}
                disabled={saving}
                className="text-xs h-8 px-4 font-semibold shadow-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="size-3.5 mr-1.5" />
                    Save changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
