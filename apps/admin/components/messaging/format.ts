const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
});

export function formatDateTime(value: string | Date) {
  return dateTimeFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatTime(value: string | Date) {
  return timeFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const dateA = typeof a === 'string' ? new Date(a) : a;
  const dateB = typeof b === 'string' ? new Date(b) : b;
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export function formatDateSeparator(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return dateFormatter.format(date);
}

export function formatFileSize(bytes: string | number | null | undefined): string {
  if (!bytes) return '';
  const num = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!Number.isFinite(num) || num <= 0) return '';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMoney(value: string, currency = 'BDT') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

