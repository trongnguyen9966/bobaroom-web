const formatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

export function formatVND(amount: number): string {
  return formatter.format(amount);
}

export function parseNumber(text: string): number {
  const cleaned = text.replace(/[^\d]/g, '');
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? 0 : value;
}

export function formatInputNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('vi-VN');
}
