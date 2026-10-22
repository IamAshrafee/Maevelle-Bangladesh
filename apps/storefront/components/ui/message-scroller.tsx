'use client';

import * as React from 'react';
import {
  MessageScroller as MessageScrollerPrimitive,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from '@shadcn/react/message-scroller';

import { cx } from './classnames';
import { ChevronDownIcon } from './icons';

function MessageScrollerProvider(
  props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>,
) {
  return <MessageScrollerPrimitive.Provider {...props} />;
}

function MessageScroller({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  return (
    <MessageScrollerPrimitive.Root
      data-slot="message-scroller"
      className={cx(
        'group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden',
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerViewport({
  className,
  preserveScrollOnPrepend = true,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
  return (
    <MessageScrollerPrimitive.Viewport
      data-slot="message-scroller-viewport"
      preserveScrollOnPrepend={preserveScrollOnPrepend}
      className={cx(
        'size-full min-h-0 min-w-0 overflow-y-auto overscroll-contain contain-content data-autoscrolling:scrollbar-thumb-transparent data-autoscrolling:scrollbar-track-transparent data-pending-scroll:invisible',
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerContent({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) {
  return (
    <MessageScrollerPrimitive.Content
      data-slot="message-scroller-content"
      className={cx('flex h-max min-h-full flex-col gap-3', className)}
      {...props}
    />
  );
}

function MessageScrollerItem({
  className,
  scrollAnchor = false,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
  return (
    <MessageScrollerPrimitive.Item
      data-slot="message-scroller-item"
      scrollAnchor={scrollAnchor}
      className={cx(
        'min-w-0 shrink-0 [contain-intrinsic-size:auto_5rem] [content-visibility:auto]',
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerButton({
  direction = 'end',
  className,
  children,
  render,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Button>) {
  return (
    <MessageScrollerPrimitive.Button
      data-slot="message-scroller-button"
      data-direction={direction}
      direction={direction}
      className={cx(
        'absolute inset-s-1/2 -translate-x-1/2 transition-[translate,scale,opacity] duration-200 data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[direction=end]:bottom-3 data-[direction=end]:data-[active=false]:translate-y-4 data-[direction=start]:top-3 data-[direction=start]:data-[active=false]:-translate-y-4 rtl:translate-x-1/2',
        className,
      )}
      {...(render !== undefined ? { render } : {})}
      {...props}
    >
      {children ?? (
        <span className="flex min-h-9 items-center gap-1.5 rounded-full bg-inverse-surface px-3.5 text-label-sm font-semibold text-inverse-on-surface shadow-floating transition-transform duration-150 hover:scale-105 active:scale-98">
          <ChevronDownIcon size={16} />
          <span>Scroll to latest</span>
        </span>
      )}
    </MessageScrollerPrimitive.Button>
  );
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
};
