const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const monthYearFormatter = new Intl.DateTimeFormat('vi-VN', {
  month: 'long',
  year: 'numeric',
});

export function formatDateTime(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatDate(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp));
}

export function formatMonthYear(date: Date): string {
  return monthYearFormatter.format(date);
}

export function formatYear(date: Date): string {
  return String(date.getFullYear());
}

export function formatDateGroupHeader(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) return 'Hôm nay';
  if (isSameDay(date, yesterday)) return 'Hôm qua';

  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function getStartOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

export function getEndOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

export function isSevenDaysAgo(timestamp: number): boolean {
  return Date.now() - timestamp >= 7 * 24 * 60 * 60 * 1000;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
