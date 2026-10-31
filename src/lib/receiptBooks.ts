// The old software refused a receipt number outside the collector's book ("Wrong Receipt No").
// Returns the warning to show, or '' when the number fits or there is no book to check against.
export function receiptBookWarning(manualNo: string, bookRange: string): string {
  const [from, to] = (bookRange || '').split(' - ').map(part => Number(part.trim()));
  if (!manualNo.trim() || !from || !to) return '';

  const number = Number(manualNo.trim());
  if (Number.isInteger(number) && number >= from && number <= to) return '';
  return `Receipt No ${manualNo.trim()} is not in the chosen book (${from} - ${to}).`;
}
