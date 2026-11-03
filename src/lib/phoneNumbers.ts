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

// The same numbers as people read them, without the 91
export function displayPhones(stored: string | null | undefined): string {
  return String(stored || '').trim().replace(/\b91([6-9]\d{9})\b/g, '$1');
}

// Mobile numbers are often typed into the address too, sometimes with a space or a 91/0 in front
const MOBILE_IN_TEXT = /(?<!\d)(?:\+?91[\s-]?|0)?([6-9](?:\s?\d){9})(?!\d)/g;

// Every mobile number in the given texts, each once, as +91 98765 43210
export function mobilesIn(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of String(text || '').matchAll(MOBILE_IN_TEXT)) found.add(match[1].replace(/\s/g, ''));
  }
  return Array.from(found).map(n => `+91 ${n.slice(0, 5)} ${n.slice(5)}`);
}

export function withoutMobiles(text: string | null | undefined): string {
  return String(text || '').replace(MOBILE_IN_TEXT, ' ').replace(/\s+/g, ' ').trim();
}
