'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ChatCheckIcon, CloseIcon } from '@/components/ui/icons';

import { currentChatPageContext, subscribeToChatContext } from './page-context';

const ChatPanel = dynamic(() => import('./chat-panel').then((module) => module.ChatPanel), {
  loading: () => null,
  ssr: false,
});

export function StorefrontChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unread, setUnread] = useState(0);
  const [contextVersion, setContextVersion] = useState(0);
  const onUnreadChange = useCallback((count: number) => setUnread(count), []);

  useEffect(() => subscribeToChatContext(() => setContextVersion((value) => value + 1)), []);
  const context = currentChatPageContext(pathname);
  void contextVersion;

  return (
    <>
      {loaded ? (
        <ChatPanel
          context={context}
          onClose={() => setOpen(false)}
          onUnreadChange={onUnreadChange}
          open={open}
        />
      ) : null}
      {!open ? (
        <button
          aria-label={unread ? `Open support chat, ${unread} unread messages` : 'Open support chat'}
          className="fixed bottom-20 right-3 z-50 flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-label-md font-semibold text-on-primary shadow-floating transition-[background-color,transform,box-shadow] duration-150 hover:bg-primary-hover active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
          onClick={() => {
            setLoaded(true);
            setOpen(true);
          }}
          type="button"
        >
          <ChatCheckIcon size={22} />
          <span>Chat with us</span>
          {unread ? (
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-full bg-white font-mono text-label-sm font-bold text-primary tabular-nums shadow-xs"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      ) : (
        <button
          aria-label="Close support chat"
          className="sr-only"
          onClick={() => setOpen(false)}
          type="button"
        >
          <CloseIcon />
        </button>
      )}
    </>
  );
}
