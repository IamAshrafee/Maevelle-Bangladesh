import type { FaqEntry, InformationGroupEntry } from '../types';

export function contentGroupsPayload(groups: readonly InformationGroupEntry[]) {
  return groups
    .map((group) => ({
      title: group.title.trim(),
      items: group.items
        .filter((item) => item.label.trim() && item.value.trim())
        .map((item) => ({ label: item.label.trim(), value: item.value.trim() })),
    }))
    .filter((group) => group.title && group.items.length > 0);
}

export function customerContentValidationError(
  groups: readonly InformationGroupEntry[],
  faqs: readonly FaqEntry[],
): string | null {
  const meaningfulGroups = groups.filter(
    (group) =>
      group.title.trim() || group.items.some((item) => item.label.trim() || item.value.trim()),
  );
  const groupTitles = meaningfulGroups.map((group) => group.title.trim().toLocaleLowerCase('en'));
  if (groupTitles.some((title) => !title))
    return 'Name every specification group that contains information.';
  if (new Set(groupTitles).size !== groupTitles.length)
    return 'Each specification group needs a unique name.';

  for (const group of meaningfulGroups) {
    const meaningfulItems = group.items.filter((item) => item.label.trim() || item.value.trim());
    if (meaningfulItems.length === 0)
      return `Add at least one key and value to “${group.title.trim()}”, or remove the empty group.`;
    if (meaningfulItems.some((item) => !item.label.trim() || !item.value.trim()))
      return `Complete both the key and value for every row in “${group.title.trim()}”.`;
    const labels = meaningfulItems.map((item) => item.label.trim().toLocaleLowerCase('en'));
    if (new Set(labels).size !== labels.length)
      return `Use each key only once in “${group.title.trim()}”.`;
  }

  if (faqs.some((faq) => Boolean(faq.question.trim()) !== Boolean(faq.answer.trim())))
    return 'Complete both the question and answer for every FAQ, or remove the incomplete FAQ.';
  return null;
}
