'use client';

import * as React from 'react';
import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

import { ADMIN_MOTION, AnimatePresence, motion } from '@/components/motion/motion-primitives';

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

function CollapsibleContent({ children, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      keepMounted
      hidden={false}
      render={(panelProps, state) => (
        <div {...panelProps} hidden={false}>
          <AnimatePresence initial={false}>
            {state.open ? (
              <motion.div
                key="collapsible-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={ADMIN_MOTION.panel}
                className="overflow-hidden"
              >
                {children}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
