'use client';

import { useState } from 'react';
import type { FaqEntry, InformationGroupEntry } from '../types';

export function useCreatorContent(onDirty?: () => void) {
  const [informationGroups, setInformationGroups] = useState<InformationGroupEntry[]>([]);
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [showAdvancedContent, setShowAdvancedContent] = useState(false);

  const markDirty = () => {
    onDirty?.();
  };

  const addInformationGroup = (title: string = '') => {
    setInformationGroups((previous) => {
      const normalizedTitle = title.trim().toLocaleLowerCase('en');
      const existingGroup = normalizedTitle
        ? previous.find((group) => group.title.trim().toLocaleLowerCase('en') === normalizedTitle)
        : undefined;
      const item = {
        id: `item-${Date.now()}-${Math.random()}`,
        label: '',
        value: '',
      };

      if (existingGroup) {
        return previous.map((group) =>
          group.id === existingGroup.id ? { ...group, items: [...group.items, item] } : group,
        );
      }

      return [...previous, { id: `group-${Date.now()}-${Math.random()}`, title, items: [item] }];
    });
    markDirty();
  };

  const updateInformationGroupTitle = (groupId: string, title: string) => {
    setInformationGroups((previous) =>
      previous.map((group) => (group.id === groupId ? { ...group, title } : group)),
    );
    markDirty();
  };

  const removeInformationGroup = (groupId: string) => {
    setInformationGroups((previous) => previous.filter((group) => group.id !== groupId));
    markDirty();
  };

  const addInformationItem = (groupId: string) => {
    setInformationGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: [
                ...group.items,
                { id: `item-${Date.now()}-${Math.random()}`, label: '', value: '' },
              ],
            }
          : group,
      ),
    );
    markDirty();
  };

  const updateInformationItem = (
    groupId: string,
    itemId: string,
    field: 'label' | 'value',
    value: string,
  ) => {
    setInformationGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map((item) =>
                item.id === itemId ? { ...item, [field]: value } : item,
              ),
            }
          : group,
      ),
    );
    markDirty();
  };

  const removeInformationItem = (groupId: string, itemId: string) => {
    setInformationGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? { ...group, items: group.items.filter((item) => item.id !== itemId) }
          : group,
      ),
    );
    markDirty();
  };

  const addFaq = (question: string = '', answer: string = '') => {
    setFaqs((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, question, answer },
    ]);
    markDirty();
  };

  const updateFaq = (id: string, field: 'question' | 'answer', val: string) => {
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: val } : f)));
    markDirty();
  };

  const removeFaq = (id: string) => {
    setFaqs((prev) => prev.filter((f) => f.id !== id));
    markDirty();
  };

  return {
    informationGroups,
    setInformationGroups,
    faqs,
    setFaqs,
    showAdvancedContent,
    setShowAdvancedContent,
    addInformationGroup,
    updateInformationGroupTitle,
    removeInformationGroup,
    addInformationItem,
    updateInformationItem,
    removeInformationItem,
    addFaq,
    updateFaq,
    removeFaq,
  };
}
