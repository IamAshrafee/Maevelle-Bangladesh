'use client';
import { useEffect, useRef, useState } from 'react';
import type { CheckoutAreaPageDto } from '@maevelle/contracts';
import { deliveryApi } from './delivery-api';
import { deliveryIssue } from './delivery-workflow';

export type DeliveryArea = CheckoutAreaPageDto['items'][number];
interface SearchState {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  items: readonly DeliveryArea[];
  nextOffset: number | null;
  message: string;
  retryAt: number;
}
const empty: SearchState = { phase: 'idle', items: [], nextOffset: null, message: '', retryAt: 0 };
/** Each query/page has a generation; even a transport that ignores abort cannot publish stale data. */
export function useAreaSearch(query: string, enabled: boolean) {
  const [state, setState] = useState(empty),
    [attempt, setAttempt] = useState(0),
    [offset, setOffset] = useState(0);
  const generation = useRef(0),
    previousQuery = useRef('');
  useEffect(() => {
    const epoch = ++generation.current,
      abort = new AbortController(),
      needle = query.trim();
    if (!enabled || [...needle].length < 2) {
      setState(empty);
      previousQuery.current = '';
      if (offset !== 0) setOffset(0);
      return () => abort.abort();
    }
    const changed = previousQuery.current !== needle;
    previousQuery.current = needle;
    if (changed && offset !== 0) {
      setOffset(0);
      return () => abort.abort();
    }
    setState((old) => ({
      ...empty,
      items: changed || offset === 0 ? [] : old.items,
      phase: 'loading',
    }));
    const timer = setTimeout(() => {
      void deliveryApi
        .search(needle, offset, abort.signal)
        .then((page) => {
          if (epoch !== generation.current || abort.signal.aborted) return;
          setState((old) => ({
            phase: 'ready',
            items: [
              ...(offset === 0 ? [] : old.items),
              ...page.items.filter((a) => !old.items.some((b) => b.id === a.id)),
            ].slice(0, 100),
            nextOffset: page.nextOffset,
            message: '',
            retryAt: 0,
          }));
        })
        .catch((error) => {
          if (epoch !== generation.current || abort.signal.aborted) return;
          const issue = deliveryIssue(error);
          setState((old) => ({
            ...old,
            phase: 'error',
            message:
              'Area search is unavailable. ' +
              (issue.code === 'RATE_LIMITED'
                ? 'Please wait before trying again.'
                : 'Try again when connected.'),
            retryAt: issue.retryAt,
          }));
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, enabled, offset, attempt]);
  return {
    ...state,
    retry: () => {
      if (Date.now() >= state.retryAt) setAttempt((n) => n + 1);
    },
    more: () => {
      if (state.nextOffset !== null && state.phase === 'ready' && state.items.length < 100)
        setOffset(state.nextOffset);
    },
  };
}
