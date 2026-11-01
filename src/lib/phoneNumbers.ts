// Customer numbers are saved as 91 + 10 digits, the form WhatsApp sending needs. A customer may
// have two, separated by a comma. Returns the saved form, '' for a cleared number, or null when
// a number is not a valid mobile number.
export function normalizePhones(text: string): string | null {
  const parts = text.split(/[,/;]+/).map(part => part.trim()).filter(Boolean);
  const numbers: string[] = [];
  for (const part of parts) {
    const digits = part.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) return null;
    numbers.push(`91${digits}`);
  }
  return numbers.join(', ');
}
