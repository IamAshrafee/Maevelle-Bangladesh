'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'maevelle_recent_searches';
const MAX_RECENT_ITEMS = 4;

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<readonly string[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, MAX_RECENT_ITEMS));
        }
      }
    } catch {
      // Ignore localStorage errors (e.g. private mode or disabled)
    }
  }, []);

  const addRecentSearch = useCallback((rawTerm: string) => {
    const term = rawTerm.trim();
    if (!term) return;

    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== term.toLowerCase());
      const next = [term, ...filtered].slice(0, MAX_RECENT_ITEMS);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore write failures
      }
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((termToRemove: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((item) => item.toLowerCase() !== termToRemove.toLowerCase());
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore write failures
      }
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore remove failures
    }
  }, []);

  return {
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
  };
}
