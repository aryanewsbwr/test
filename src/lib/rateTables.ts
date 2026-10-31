import { Rate, RateChange } from './types';

// Today's rates and rate changes from the database, for screens that price sales themselves
export async function fetchRateTables(): Promise<{ rates: Rate[]; ratechanges: RateChange[] }> {
  const res = await fetch('/api/rates?tables=true');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load rates');
  return data;
}
