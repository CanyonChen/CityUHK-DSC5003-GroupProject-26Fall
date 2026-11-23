const HKT = 'Asia/Hong_Kong';

export function money(cents, currency = 'HKD') {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

export function dateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: HKT,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function dateShort(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: HKT,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function dateParts(iso) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: HKT, day: '2-digit' }).format(d);
  const month = new Intl.DateTimeFormat('en-GB', { timeZone: HKT, month: 'short' }).format(d).toUpperCase();
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: HKT, weekday: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: HKT,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return { day, month, weekday, time };
}

export function countdown(ms) {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function statusLabel(status) {
  return (status || '').replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
