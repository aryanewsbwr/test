// Indian financial year, April to March. Yearly tables are named after it, e.g. receipt20262027.
export function fyStartYear(date: Date = new Date()): number {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

export function fySuffix(date: Date = new Date()): string {
  const start = fyStartYear(date);
  return `${start}${start + 1}`;
}

export function previousFySuffix(date: Date = new Date()): string {
  const start = fyStartYear(date) - 1;
  return `${start}${start + 1}`;
}

export function fyLabel(date: Date = new Date()): string {
  const start = fyStartYear(date);
  return `${start}-${start + 1}`;
}
