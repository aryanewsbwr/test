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
  ratechanges: RateChange[] = [],
  magzineDay?: number | null
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
      // A single rate saved without a real weekday belongs on Sunday, like other legacy magazines
      const day = r.dayofweek || (r as any).Dayofweek || 1;
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
    const rcDated = (rc.dated || (rc as any).Dated || (rc as any).effective_date || '').split('T')[0];
    return rcDated && rcDated <= targetDateIso;
  });

  // Sort ascending by date so newest rate changes overwrite older ones
  matchingChanges.sort((a, b) => {
    const dA = (a.dated || (a as any).Dated || (a as any).effective_date || '').split('T')[0];
    const dB = (b.dated || (b as any).Dated || (b as any).effective_date || '').split('T')[0];
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

  // 3. For magazines with specific publishing day (magzineDay 2..7)
  // Legacy FoxPro stored single rate under Dayofweek 1 (Sunday).
  // If the magazine's actual publishing day is Monday..Saturday and has 0 while Day 1 has rate,
  // align rate to its actual publishing day.
  const mDay = magzineDay ? Number(magzineDay) : (publicaId === 513 || publicaId === 512 || publicaId === 9 ? 2 : 0);
  if (mDay >= 2 && mDay <= 7) {
    if (result[mDay] === 0 && result[1] > 0) {
      result[mDay] = result[1];
      result[1] = 0;
    }
  }

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
  ratechanges: RateChange[] = [],
  magzineDay?: number | null
): number {
  const map = getEffectiveWeekdayRates(publicaId, targetDateIso, rates, ratechanges, magzineDay);
  if (map[dayOfWeek] && map[dayOfWeek] > 0) {
    return map[dayOfWeek];
  }
  if (magzineDay && map[magzineDay] && map[magzineDay] > 0) {
    return map[magzineDay];
  }
  if (map[1] && map[1] > 0) {
    return map[1];
  }
  const anyRate = Object.values(map).find(v => v > 0);
  if (anyRate && anyRate > 0) {
    return anyRate;
  }
  return 0;
}

export interface PeriodicityInfo {
  isDaily: boolean;
  periodicity: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly' | 'Quarterly' | 'Special';
  label: string;
  rows: { id: number; label: string; sub: string }[];
  rates: Record<number, number>;
}

/**
 * Resolves the true periodicity and rate structure for any publication (Daily newspaper vs Magazine/Periodical).
 * Maps FoxPro legacy conventions:
 * - 7 rates in rate table or type_p='Daily' -> Daily Newspaper (Sun..Sat)
 * - 1 rate in rate table with Dayofweek:
 *     1 = Weekly
 *     2 = Fortnightly (Issue 1 [1st-15th] & Issue 2 [16th-End])
 *     3 = Monthly
 *     4 = Quarterly
 *     6 = Special / Book / CD
 */
export function getPublicationPeriodicityAndRates(
  pub: {
    publica_id: number;
    public_name?: string;
    type_p?: string | null;
    duration?: string | null;
    magzine_day?: number | null;
  },
  targetDateIso: string = new Date().toISOString().split('T')[0],
  rates: Rate[] = [],
  ratechanges: RateChange[] = []
): PeriodicityInfo {
  const pubId = pub.publica_id;
  const pRates = rates.filter(r => (r.publica_id || (r as any).Publica_id) === pubId);
  const pType = (pub.type_p || '').toLowerCase();
  const pDur = (pub.duration || '').trim();

  // 1. Check if Daily
  const isExplicitDaily = pType.includes('daily') || pType.includes('newspaper');
  const has7Rates = pRates.length >= 7;
  const isDaily = has7Rates || (isExplicitDaily && !pType.includes('weekly') && !pType.includes('mag'));

  if (isDaily) {
    const weekdayRates = getEffectiveWeekdayRates(pubId, targetDateIso, rates, ratechanges, pub.magzine_day);
    return {
      isDaily: true,
      periodicity: 'Daily',
      label: 'Daily Newspaper (दैनिक समाचार पत्र)',
      rows: [
        { id: 1, label: 'Sunday (रविवार)', sub: 'Sun' },
        { id: 2, label: 'Monday (सोमवार)', sub: 'Mon' },
        { id: 3, label: 'Tuesday (मंगलवार)', sub: 'Tue' },
        { id: 4, label: 'Wednesday (बुधवार)', sub: 'Wed' },
        { id: 5, label: 'Thursday (गुरुवार)', sub: 'Thu' },
        { id: 6, label: 'Friday (शुक्रवार)', sub: 'Fri' },
        { id: 7, label: 'Saturday (शनिवार)', sub: 'Sat' },
      ],
      rates: weekdayRates
    };
  }

  // 2. Periodical / Magazine: Determine periodicity
  // Fallback dow from rate table if duration not explicitly set
  const baseDow = pRates[0]?.dayofweek || (pRates[0] as any)?.Dayofweek || 3;
  let periodicity: 'Weekly' | 'Fortnightly' | 'Monthly' | 'Quarterly' | 'Special' = 'Monthly';

  if (pDur.toLowerCase().includes('fortnight') || pDur.includes('पाक्षिक') || pType.includes('fortnight') || baseDow === 2) {
    periodicity = 'Fortnightly';
  } else if (pDur.toLowerCase().includes('week') || pDur.includes('साप्ताहिक') || pType.includes('weekly') || baseDow === 1) {
    periodicity = 'Weekly';
  } else if (pDur.toLowerCase().includes('quarter') || pDur.includes('त्रैमासिक') || baseDow === 4 || pubId === 75) {
    periodicity = 'Quarterly';
  } else if (pDur.toLowerCase().includes('special') || baseDow === 6) {
    periodicity = 'Special';
  } else {
    periodicity = 'Monthly';
  }

  // 3. Resolve historical rate changes for this periodical
  const matchingChanges = ratechanges.filter(rc => {
    const rcPub = rc.publica_id || (rc as any).Publica_id;
    if (rcPub !== pubId) return false;
    const rcDated = (rc.dated || (rc as any).Dated || (rc as any).effective_date || '').split('T')[0];
    return rcDated && rcDated <= targetDateIso;
  });

  matchingChanges.sort((a, b) => {
    const dA = (a.dated || (a as any).Dated || (a as any).effective_date || '').split('T')[0];
    const dB = (b.dated || (b as any).Dated || (b as any).effective_date || '').split('T')[0];
    return dA.localeCompare(dB);
  });

  const baseRate = Number(pRates[0]?.rate ?? (pRates[0] as any)?.Rate ?? 0);

  if (periodicity === 'Fortnightly') {
    // Fortnightly has Issue 1 (1st-15th) and Issue 2 (16th-End)
    let r1 = 0;
    let r2 = 0;
    for (let i = matchingChanges.length - 1; i >= 0; i--) {
      const rc: any = matchingChanges[i];
      const dStr = (rc.effective_date || rc.dated || rc.Dated || '').split('T')[0];
      const day = parseInt(dStr.split('-')[2], 10) || 1;
      const val = Number(rc.new_rate ?? rc.NewRate ?? rc.newrate ?? 0);
      if (val > 0) {
        if (day <= 15 && !r1) r1 = val;
        if (day > 15 && !r2) r2 = val;
      }
      if (r1 && r2) break;
    }
    const finalR1 = r1 || r2 || baseRate;
    const finalR2 = r2 || r1 || baseRate;

    return {
      isDaily: false,
      periodicity: 'Fortnightly',
      label: 'Fortnightly Magazine (पाक्षिक पत्रिका - 2 अंक प्रति माह)',
      rows: [
        { id: 1, label: 'Issue 1 (प्रथम अंक)', sub: '1st - 15th of month (1 से 15 तारीख)' },
        { id: 2, label: 'Issue 2 (द्वितीय अंक)', sub: '16th - End of month (16 से माह अंत)' }
      ],
      rates: { 1: finalR1, 2: finalR2 }
    };
  }

  // Weekly, Monthly, Quarterly, or Special
  let resolvedRate = baseRate;
  for (const rc of matchingChanges) {
    const val = Number(rc.new_rate !== undefined ? rc.new_rate : ((rc as any).NewRate ?? (rc as any).newrate ?? 0));
    if (val > 0) {
      resolvedRate = val;
    }
  }

  let label = 'Monthly Magazine (मासिक पत्रिका)';
  let rowLabel = 'Monthly Issue (मासिक अंक दर)';
  let rowSub = '1 Issue per month';

  if (periodicity === 'Weekly') {
    label = 'Weekly Magazine (साप्ताहिक पत्रिका)';
    rowLabel = 'Weekly Issue (साप्ताहिक अंक दर)';
    rowSub = 'Each weekly issue';
  } else if (periodicity === 'Quarterly') {
    label = 'Quarterly Periodical (त्रैमासिक पत्रिका)';
    rowLabel = 'Quarterly Issue (त्रैमासिक अंक दर)';
    rowSub = 'Every 3 months';
  } else if (periodicity === 'Special') {
    label = 'Special Publication / Book / CD (विशेष / पुस्तक / अंक)';
    rowLabel = 'Single Copy Rate (प्रति प्रति दर)';
    rowSub = 'One-off / Regular';
  }

  return {
    isDaily: false,
    periodicity,
    label,
    rows: [
      { id: 1, label: rowLabel, sub: rowSub }
    ],
    rates: { 1: resolvedRate }
  };
}

