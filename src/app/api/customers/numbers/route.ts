import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { currentUser, refuseWithout } from '@/lib/auth';
import { normalizePhones } from '@/lib/phoneNumbers';

export const dynamic = 'force-dynamic';

const HISTORY_TABLE = 'customer_phone_history';
const NO_HISTORY_TABLE = 'History is not set up yet. Run supabase/phone_history.sql in Supabase first. No number was changed.';

const isMissingTable = (error: any) => error?.code === '42P01' || error?.code === 'PGRST205' || String(error?.message || '').includes(HISTORY_TABLE);

// Number changes, newest first, for one region or all of them
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regionId = searchParams.get('region_id');

    let query = supabase.from(HISTORY_TABLE).select('*').order('changed_at', { ascending: false }).limit(500);
    if (regionId && regionId !== 'all') query = query.eq('region_id', parseInt(regionId, 10));

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ history: [], not_set_up: true });
      throw new Error(`Could not read number history: ${error.message}`);
    }
    return NextResponse.json({ history: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Saves edited numbers. Each change is written to History before the number itself, so no
// number can change without a record of it.
export async function POST(request: NextRequest) {
  const refused = await refuseWithout(request, 'can_access_master');
  if (refused) return refused;

  try {
    const body = await request.json();
    const changes: { customer_id: number; phone: string; old_phone: string }[] = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length === 0) return NextResponse.json({ error: 'No numbers to save' }, { status: 400 });

    const wanted = new Map<number, { phone: string; oldPhone: string }>();
    const invalid: number[] = [];
    for (const change of changes) {
      const phone = normalizePhones(String(change.phone ?? ''));
      if (phone === null) invalid.push(Number(change.customer_id));
      else wanted.set(Number(change.customer_id), { phone, oldPhone: String(change.old_phone ?? '').trim() });
    }
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Not a valid mobile number for customer ${invalid.join(', ')}. Nothing was saved.`, invalid }, { status: 400 });
    }

    const { data: customers, error: readErr } = await supabase
      .from('customer')
      .select('customer_id, name_eng, region_id, phone')
      .in('customer_id', Array.from(wanted.keys()));
    if (readErr) throw new Error(`Could not read customers: ${readErr.message}`);

    const user = await currentUser(request);
    const historyRows: any[] = [];
    const changedElsewhere: number[] = [];
    for (const c of customers || []) {
      const entry = wanted.get(Number(c.customer_id))!;
      const stored = String(c.phone || '').trim();
      if (stored === entry.phone) continue;
      // Someone else changed this number after the screen loaded: theirs stays
      if (stored !== entry.oldPhone) {
        changedElsewhere.push(Number(c.customer_id));
        continue;
      }
      historyRows.push({
        customer_id: c.customer_id,
        customer_name: c.name_eng,
        region_id: c.region_id,
        old_phone: stored,
        new_phone: entry.phone,
        changed_by: user?.username || user?.id || ''
      });
    }

    if (historyRows.length === 0) {
      return NextResponse.json({ success: true, saved: {}, changed_elsewhere: changedElsewhere, failed: [] });
    }

    const { data: logged, error: logErr } = await supabase.from(HISTORY_TABLE).insert(historyRows).select('id, customer_id, new_phone');
    if (logErr) {
      if (isMissingTable(logErr)) return NextResponse.json({ error: NO_HISTORY_TABLE }, { status: 400 });
      throw new Error(`Could not save number history: ${logErr.message}`);
    }

    const saved: Record<number, string> = {};
    const failed: number[] = [];
    for (const row of logged || []) {
      const { error } = await supabase.from('customer').update({ phone: row.new_phone }).eq('customer_id', row.customer_id);
      if (error) {
        failed.push(Number(row.customer_id));
        await supabase.from(HISTORY_TABLE).delete().eq('id', row.id);
      } else {
        saved[Number(row.customer_id)] = row.new_phone;
      }
    }

    return NextResponse.json({ success: failed.length === 0, saved, changed_elsewhere: changedElsewhere, failed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
