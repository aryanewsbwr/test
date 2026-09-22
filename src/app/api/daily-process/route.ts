import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

let cachedPubs: any[] | null = null;
let cachedHawkers: any[] | null = null;

function loadData() {
  if (!cachedPubs) {
    const f = path.join(process.cwd(), 'public', 'data', 'publications.json');
    if (fs.existsSync(f)) cachedPubs = JSON.parse(fs.readFileSync(f, 'utf-8'));
    else cachedPubs = [];
  }
  if (!cachedHawkers) {
    const f = path.join(process.cwd(), 'public', 'data', 'hawkers.json');
    if (fs.existsSync(f)) cachedHawkers = JSON.parse(fs.readFileSync(f, 'utf-8'));
    else cachedHawkers = [];
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
    loadData();
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const hawkerIdFilter = searchParams.get('hawker_id') || 'all';

    const targetDate = new Date(dateStr);
    // getDay(): 0=Sun..6=Sat => legacy 1=Sun..7=Sat
    const legacyDay = targetDate.getDay() + 1;

    // Fetch active subscriptions directly from customer_detail in Supabase
    let query = supabase.from('customer_detail').select('*');
    if (hawkerIdFilter !== 'all') {
      query = query.eq('hawker_id', parseInt(hawkerIdFilter, 10));
    }
    const { data: dbSubs, error: subErr } = await query;
    if (subErr) {
      console.warn('Error querying customer_detail in daily-process:', subErr);
    }

    // Filter active subscriptions on target date
    const activeSubs = (dbSubs || []).filter((sub: any) => {
      // Must be active (no closure date, or closure date after targetDate)
      if (sub.c_date) {
        // e.g. 04/11/2019 or 2019-11-04
        let cDateObj: Date | null = null;
        if (sub.c_date.includes('/')) {
          const [d, m, y] = sub.c_date.split('/').map(Number);
          cDateObj = new Date(y, m - 1, d);
        } else {
          cDateObj = new Date(sub.c_date);
        }
        if (cDateObj && cDateObj <= targetDate) return false;
      }
      // Check delivery days
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
      const hw = (cachedHawkers || []).find(h => h.hawker_id === item.hawker_id);
      const pub = (cachedPubs || []).find(p => p.publica_id === item.publica_id);
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
