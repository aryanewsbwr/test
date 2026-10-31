import { NextRequest, NextResponse } from 'next/server';
import { fetchAllRows, fetchPublications } from '@/lib/publicationsData';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { parseLegacyDateToIso } from '@/lib/billingEngine';

export const dynamic = 'force-dynamic';

// Subscriptions, optionally for one hawker, read from the database page by page
async function fetchSubscriptions(hawkerId: number | null): Promise<any[]> {
  if (!hawkerId) return fetchAllRows('customer_detail', 'sno');
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('customer_detail').select('*').eq('hawker_id', hawkerId).order('sno').range(from, from + 999);
    if (error) throw new Error(`Could not read subscriptions: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
function isDeliveredOnDay(fromDay: string, dayOfWeek: number): boolean {
  if (!fromDay || fromDay === '1-7' || fromDay === 'Daily') return true;
  if (fromDay === '2-7') return dayOfWeek >= 2 && dayOfWeek <= 7;
  if (fromDay === '1') return dayOfWeek === 1;
  if (fromDay === '7') return dayOfWeek === 7;
  if (fromDay.includes('-')) {
    const [start, end] = fromDay.split('-').map(Number);
    if (!isNaN(start) && !isNaN(end)) {
      return dayOfWeek >= start && dayOfWeek <= end;
    }
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const hawkerIdFilter = searchParams.get('hawker_id') || 'all';

    const targetDate = new Date(dateStr);
    // getDay(): 0=Sun..6=Sat => legacy 1=Sun..7=Sat
    const legacyDay = targetDate.getDay() + 1;

    const [pubs, hawkers, dbSubs] = await Promise.all([
      fetchPublications(),
      fetchAllRows('hawker', 'hawker_id'),
      fetchSubscriptions(hawkerIdFilter !== 'all' ? parseInt(hawkerIdFilter, 10) : null)
    ]);

    // Subscriptions running on the target date: started on or before it, not closed by it
    const activeSubs = dbSubs.filter((sub: any) => {
      const sIso = parseLegacyDateToIso(sub.s_date);
      const cIso = parseLegacyDateToIso(sub.c_date);
      if (sIso && sIso > dateStr) return false;
      if (cIso && cIso <= dateStr) return false;
      return isDeliveredOnDay(sub.from_day, legacyDay);
    });

    // Aggregate by (hawker_id, publica_id)
    const map = new Map<string, { hawker_id: number; publica_id: number; copies: number; circulation: string }>();

    for (const s of activeSubs) {
      const hId = s.hawker_id || 1;
      const pId = s.publica_id || 1;
      if (hawkerIdFilter !== 'all' && hId.toString() !== hawkerIdFilter) {
        continue;
      }

      const key = `${hId}_${pId}`;
      const existing = map.get(key);
      const qty = s.qty || 1;
      if (existing) {
        existing.copies += qty;
      } else {
        map.set(key, {
          hawker_id: hId,
          publica_id: pId,
          copies: qty,
          circulation: s.circulation || 'Morning'
        });
      }
    }

    // Enrich with Hawker Names and Publication Names
    const results = Array.from(map.values()).map(item => {
      const hw = hawkers.find(h => h.hawker_id === item.hawker_id);
      const pub = pubs.find(p => p.publica_id === item.publica_id);
      return {
        hawker_id: item.hawker_id,
        hawker_name: hw ? hw.name : `Hawker #${item.hawker_id}`,
        publica_id: item.publica_id,
        publica_name: pub ? pub.public_name : `Publication #${item.publica_id}`,
        copies: item.copies,
        circulation: item.circulation
      };
    });

    // Sort by hawker_name then publica_name
    results.sort((a, b) => a.hawker_name.localeCompare(b.hawker_name) || a.publica_name.localeCompare(b.publica_name));

    const totalCopies = results.reduce((acc, r) => acc + r.copies, 0);

    return NextResponse.json({
      date: dateStr,
      day_of_week: legacyDay,
      total_copies: totalCopies,
      total_entries: results.length,
      manifest: results
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
