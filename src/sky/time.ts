export interface SelectedTimeCopy {
  heading: 'Selected time';
  utc: string;
  local: string;
}

/** Calculations are tied to an explicit instant. The heading is never a live-tracking label. */
export function formatSelectedTime(date: Date): SelectedTimeCopy {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid selected time');
  return {
    heading: 'Selected time',
    utc: date.toISOString(),
    local: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date),
  };
}

export function parseDatetimeLocal(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new RangeError('Invalid selected time');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid selected time');
  return date;
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
