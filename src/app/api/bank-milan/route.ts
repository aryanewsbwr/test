import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUser, refuseWithout } from '@/lib/auth';
import { fySuffix } from '@/lib/financialYear';
import { nameFit } from '@/lib/bankMilan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const db = supabaseAdmin;
const tenDigits = (text: any) => Array.from(String(text ?? '').matchAll(/(?<!\d)(?:\+?91[\s-]?|0)?([6-9]\d{9})(?!\d)/g), m => m[1]);

async function allRows(table: string, columns: string, order: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order(order, { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// Customers with every mobile number they have (phone box and Hindi address), kept for 10 minutes
let customerCache: { at: number; byId: Map<number, any>; byMobile: Map<string, number[]> } | null = null;
async function customers() {
  if (customerCache && Date.now() - customerCache.at < 10 * 60 * 1000) return customerCache;
  const rows = await allRows('customer', 'customer_id, name_eng, name_hindi_unicode, phone, hindi_add, region_id', 'customer_id');
  const byId = new Map<number, any>();
  const byMobile = new Map<string, number[]>();
  for (const c of rows) {
    const id = Number(c.customer_id);
    byId.set(id, c);
    for (const n of new Set([...tenDigits(c.phone), ...tenDigits(c.hindi_add)])) byMobile.set(n, [...(byMobile.get(n) || []), id]);
  }
  customerCache = { at: Date.now(), byId, byMobile };
  return customerCache;
}

// Recent receipts (the last 8,000), by amount: a receipt for the same amount within 3 days of a credit
async function recentReceipts() {
  const { data, error } = await db.from(`receipt${fySuffix()}`).select('customer_id, recp_no, mal_recp_amt, recp_date, remarks')
    .order('id', { ascending: false }).range(0, 7999);
  if (error) return [];
  return (data || []).map((r: any) => {
    let extra: any = {};
    try { extra = JSON.parse(r.remarks || '{}') || {}; } catch { /* plain text */ }
    const dmy = String(extra.mal_recp_dt || r.recp_date || '');
    const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return { customer_id: Number(r.customer_id), amount: Number(r.mal_recp_amt) || 0, day: m ? `${m[3]}-${m[2]}-${m[1]}` : '', receipt_no: String(extra.manual_rep_no || extra.mal_rep_no || '') };
  }).filter(r => r.day);
}

const dayGap = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
const nameOf = (c: any) => (c ? String(c.name_hindi_unicode || c.name_eng || '').trim() : '');

// GET ?from=yyyy-mm-dd&to=yyyy-mm-dd&show=pending|all|ok|out
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  try {
    const p = req.nextUrl.searchParams;
    const from = p.get('from') || '2000-01-01', to = p.get('to') || '2999-12-31', show = p.get('show') || 'pending';
    let q = db.from('bank_credits').select('*').gte('credit_date', from).lte('credit_date', to).order('credit_date', { ascending: false }).order('key');
    if (show === 'pending') q = q.eq('status', '');
    else if (show === 'ok' || show === 'out') q = q.eq('status', show);
    const { data: credits, error } = await q.limit(3000);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ error: 'पहले supabase/bank_milan.sql एक बार चलाएँ', missing: true }, { status: 400 });
      throw new Error(error.message);
    }

    const [{ byId, byMobile }, { data: links }, receipts] = await Promise.all([customers(), db.from('upi_id_links').select('*'), recentReceipts()]);
    const linkOf = new Map((links || []).map((l: any) => [String(l.vpa).toLowerCase(), l]));

    const rows = (credits || []).map((c: any) => {
      const payer = [c.phonepe_name, c.payer_name].filter(Boolean).join(' ');
      const fits = (id: number) => nameFit(payer, String(byId.get(id)?.name_eng || '')).fit > 0;
      let sug: { id: number; from: string } | null = null;
      let alts: number[] = [];
      const warn: string[] = [];
      if (c.status !== 'ok' && c.status !== 'out') {
        // 1. this UPI ID was confirmed for a customer before
        const link = c.payer_vpa ? linkOf.get(String(c.payer_vpa).toLowerCase()) : null;
        if (link) sug = { id: Number(link.customer_id), from: 'पिछली UPI ID' };
        // 2. the mobile number in the UPI ID
        if (!sug && c.payer_mobile) {
          const ids = Array.from(new Set(byMobile.get(c.payer_mobile) || []));
          if (ids.length === 1) sug = { id: ids[0], from: 'मोबाइल' };
          else if (ids.length > 1) {
            const like = ids.filter(fits);
            if (like.length === 1) sug = { id: like[0], from: 'मोबाइल + नाम' };
            else { alts = ids.slice(0, 6); warn.push('मोबाइल कई ग्राहकों का है'); }
          }
        }
        // 3. Himanshu's imported suggestion
        if (!sug && c.customer_id) sug = { id: Number(c.customer_id), from: 'पुरानी फ़ाइल' };
        // 4. a receipt for the same amount within 3 days
        const sameAmount = receipts.filter(r => Math.abs(r.amount - Number(c.amount)) < 1 && dayGap(r.day, c.credit_date) <= 3);
        const byReceipt = Array.from(new Set(sameAmount.map(r => r.customer_id)));
        if (!sug && byReceipt.length === 1) sug = { id: byReceipt[0], from: 'रसीद (राशि + तारीख)' };
        // 5. the full name PhonePe shows
        if (!sug && c.phonepe_name) {
          let best: number[] = [], bestFit = 0;
          for (const [id, cust] of Array.from(byId)) {
            const f = nameFit(c.phonepe_name, String(cust.name_eng || ''));
            if (f.words >= 2 && f.fit === f.words) {
              if (f.fit > bestFit) { best = [id]; bestFit = f.fit; } else if (f.fit === bestFit) best.push(id);
            }
          }
          if (best.length === 1) sug = { id: best[0], from: 'PhonePe नाम' };
          else if (best.length > 1 && !alts.length) alts = best.slice(0, 6);
        }
        if (sug && payer && !fits(sug.id)) warn.push('भेजने वाले का नाम अलग — जाँचें');
        if (sug && !c.receipt_no) {
          const rec = sameAmount.find(r => r.customer_id === sug!.id);
          if (rec?.receipt_no) (c as any).receipt_suggest = rec.receipt_no;
        }
      }
      const who = c.status === 'ok' ? Number(c.customer_id) : sug?.id;
      return {
        ...c,
        amount: Number(c.amount),
        customer_name: c.status === 'ok' ? nameOf(byId.get(Number(c.customer_id))) : '',
        suggest_id: c.status === 'ok' ? null : sug?.id ?? null,
        suggest_name: sug ? nameOf(byId.get(sug.id)) : '',
        suggest_from: sug?.from || '',
        alternatives: alts.map(id => ({ id, name: nameOf(byId.get(id)) })),
        warning: warn.join(' | '),
        region_id: who ? byId.get(who)?.region_id ?? null : null
      };
    });

    const { count: pending } = await db.from('bank_credits').select('key', { count: 'exact', head: true }).eq('status', '');
    return NextResponse.json({ rows, pending: pending || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST { action: 'upload' | 'phonepe' | 'save' | 'import', ... }
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  try {
    const body = await req.json();
    const user = (await currentUser(req))?.username || '';

    if (body.action === 'upload') {
      // New credits only: the same UTR, or the same Txn No and amount, is already there
      const credits: any[] = Array.isArray(body.credits) ? body.credits : [];
      if (!credits.length) return NextResponse.json({ error: 'फाइल में कोई जमा (Credit) नहीं मिली' }, { status: 400 });
      const dates = credits.map(c => c.credit_date).sort();
      const { data: have, error } = await db.from('bank_credits').select('key, txn_no, amount').gte('credit_date', dates[0]).lte('credit_date', dates[dates.length - 1]);
      if (error) throw new Error(error.message);
      const keys = new Set((have || []).map((h: any) => h.key));
      const txnAmt = new Set((have || []).map((h: any) => `${h.txn_no}|${Number(h.amount)}`));
      const fresh = credits.filter(c => !keys.has(c.key) && !txnAmt.has(`${c.txn_no}|${Number(c.amount)}`));
      for (let i = 0; i < fresh.length; i += 500) {
        const { error: insErr } = await db.from('bank_credits').upsert(fresh.slice(i, i + 500).map(c => ({ ...c, status: '' })), { onConflict: 'key', ignoreDuplicates: true });
        if (insErr) throw new Error(insErr.message);
      }
      return NextResponse.json({ ok: true, in_file: credits.length, added: fresh.length, amount: fresh.reduce((s, c) => s + Number(c.amount), 0) });
    }

    if (body.action === 'phonepe') {
      // PhonePe's full payer name for credits already here (matched by UTR)
      const rows: { utr: string; name: string }[] = Array.isArray(body.rows) ? body.rows : [];
      let updated = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const part = rows.slice(i, i + 200);
        // A UTR can start with zeros that PhonePe's file leaves off (006438297992)
        const bare = (u: string) => String(u).replace(/^0+/, '');
        const keys = part.flatMap(r => [bare(r.utr), bare(r.utr).padStart(12, '0')]);
        const { data } = await db.from('bank_credits').select('key, phonepe_name').in('key', Array.from(new Set(keys)));
        for (const c of data || []) {
          const r = part.find(x => bare(x.utr) === bare(c.key));
          if (r && r.name && r.name !== c.phonepe_name) {
            await db.from('bank_credits').update({ phonepe_name: r.name }).eq('key', c.key);
            updated++;
          }
        }
      }
      return NextResponse.json({ ok: true, rows: rows.length, updated });
    }

    if (body.action === 'save') {
      const key = String(body.key || '');
      const d = body.data || {};
      const patch: any = { updated_at: new Date().toISOString(), updated_by: user };
      for (const k of ['customer_id', 'status', 'note', 'receipt_no', 'hawker']) if (k in d) patch[k] = d[k] === '' && k === 'customer_id' ? null : d[k];
      if (patch.status === 'ok' && !patch.customer_id) return NextResponse.json({ error: 'पक्का करने के लिए ग्राहक चुनें' }, { status: 400 });
      const { data: saved, error } = await db.from('bank_credits').update(patch).eq('key', key).select('payer_vpa, customer_id, status').maybeSingle();
      if (error) throw new Error(error.message);
      if (!saved) return NextResponse.json({ error: 'यह जमा नहीं मिली' }, { status: 404 });
      // Confirmed: this UPI ID is that customer's from now on
      if (saved.status === 'ok' && saved.payer_vpa && saved.customer_id) {
        await db.from('upi_id_links').upsert({ vpa: String(saved.payer_vpa).toLowerCase(), customer_id: saved.customer_id, set_at: new Date().toISOString() }, { onConflict: 'vpa' });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'import') {
      // Himanshu's Bank_Milaan_Master.csv, already read into rows by the screen
      const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from('bank_credits').upsert(rows.slice(i, i + 500), { onConflict: 'key', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      const links = new Map<string, number>();
      for (const r of rows) if (r.status === 'ok' && r.payer_vpa && r.customer_id) links.set(String(r.payer_vpa).toLowerCase(), Number(r.customer_id));
      const linkRows = Array.from(links, ([vpa, customer_id]) => ({ vpa, customer_id, note: 'हिमांशु की फ़ाइल से' }));
      for (let i = 0; i < linkRows.length; i += 500) {
        const { error } = await db.from('upi_id_links').upsert(linkRows.slice(i, i + 500), { onConflict: 'vpa', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, rows: rows.length, links: linkRows.length });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
