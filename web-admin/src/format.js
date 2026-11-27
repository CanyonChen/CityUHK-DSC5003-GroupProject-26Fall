const HKT = 'Asia/Hong_Kong';

export function money(cents, currency = 'HKD') {
  if (cents === null || cents === undefined) return '—';
  const n = Number(cents) / 100;
  return `${currency} $${n.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function hkt(value, { dateOnly = false } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = dateOnly
    ? { timeZone: HKT, year: 'numeric', month: 'short', day: '2-digit' }
    : { timeZone: HKT, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
  return new Intl.DateTimeFormat('en-HK', opts).format(d);
}

export function shortDate(value) {
  return hkt(value, { dateOnly: true });
}

export function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const shifted = new Date(d.getTime() + 8 * 3600 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function fromLocalInput(value) {
  if (!value) return null;
  return value.length === 16 ? `${value}:00+08:00` : `${value}+08:00`;
}
