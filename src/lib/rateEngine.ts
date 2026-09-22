import { Rate, RateChange } from './types';

/**
 * Legacy Day of Week: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
 */
export function getLegacyDayOfWeek(date: Date): number {
  return date.getDay() + 1;
}

/**
 * Returns a 7-day rate map { 1: Sun, 2: Mon, ..., 7: Sat } for a given publication,
 * automatically resolving rate changes up to the given target date (defaults to today).
 */
export function getEffectiveWeekdayRates(
  publicaId: number,
  targetDateIso: string = new Date().toISOString().split('T')[0],
  rates: Rate[] = [],
  ratechanges: RateChange[] = []
): Record<number, number> {
  const result: Record<number, number> = {
    1: 0, // Sunday
    2: 0, // Monday
    3: 0, // Tuesday
    4: 0, // Wednesday
    5: 0, // Thursday
    6: 0, // Friday
    7: 0  // Saturday
  };

  // 1. Seed with base rates from rate table
  const baseRates = rates.filter(r => (r.publica_id || (r as any).Publica_id) === publicaId);
  if (baseRates.length > 0) {
    baseRates.forEach(r => {
      const day = r.dayofweek || (r as any).Dayofweek;
      const rateVal = Number(r.rate !== undefined ? r.rate : (r as any).Rate);
      if (day >= 1 && day <= 7 && rateVal > 0) {
        result[day] = rateVal;
      }
    });
  }

  // 2. Apply rate changes in chronological order up to targetDateIso
  const matchingChanges = ratechanges.filter(rc => {
    const rcPub = rc.publica_id || (rc as any).Publica_id;
    if (rcPub !== publicaId) return false;
    const rcDated = (rc.dated || (rc as any).Dated || '').split('T')[0];
    return rcDated && rcDated <= targetDateIso;
  });

  // Sort ascending by date so newest rate changes overwrite older ones
  matchingChanges.sort((a, b) => {
    const dA = (a.dated || (a as any).Dated || '').split('T')[0];
    const dB = (b.dated || (b as any).Dated || '').split('T')[0];
    return dA.localeCompare(dB);
  });

  matchingChanges.forEach(rc => {
    const newRate = Number(rc.new_rate !== undefined ? rc.new_rate : ((rc as any).NewRate ?? (rc as any).newrate ?? 0));
    const day = rc.dayofweek !== undefined ? rc.dayofweek : (rc as any).Dayofweek;

    if (newRate > 0) {
      if (day >= 1 && day <= 7) {
        result[day] = newRate;
      } else if (day === 0 || day === null || day === undefined) {
        // If dayofweek is 0 or null, applies across all 7 days
        for (let d = 1; d <= 7; d++) {
          result[d] = newRate;
        }
      }
    }
  });

  return result;
}

/**
 * Returns single effective rate for a specific publication on a specific day of week and date.
 */
export function getSingleEffectiveRate(
  publicaId: number,
  dayOfWeek: number, // 1=Sun .. 7=Sat
  targetDateIso: string = new Date().toISOString().split('T')[0],
  rates: Rate[] = [],
  ratechanges: RateChange[] = []
): number {
  const map = getEffectiveWeekdayRates(publicaId, targetDateIso, rates, ratechanges);
  return map[dayOfWeek] || 0;
}
