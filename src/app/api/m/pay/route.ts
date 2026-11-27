import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { fySuffix } from '@/lib/financialYear';
import {
  mobileCaller, canSeeRegion, balancesFor, latestBill, collectorName, todayIndia
} from '@/lib/mobile';

export const dynamic = 'force-dynamic';

const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const round = (n: number) => Math.round(n * 100) / 100;

// POST { customer_id, amount, mode: 'cash' | 'upi', request_id } (the Ml. No. is given here, from 65001)
// Saves a payment the way the Receipt screen does: the next system receipt no., the customer's
// latest bill month, the paper receipt no. from the collector's book, Ml. Date = today, and the
// customer's balance after it. Who saved it and when goes with the receipt.
// The staff app's Ml. No. series: 65001 upwards. The highest one used this year, plus one.
const APP_RECEIPT_FROM = 65001;
const APP_RECEIPT_TO = 69999;
async function nextAppReceiptNo(table: string): Promise<number> {
  let top = APP_RECEIPT_FROM - 1;
  const take = (v: any) => { const n = Number(v); if (n >= APP_RECEIPT_FROM && n <= APP_RECEIPT_TO && n > top) top = n; };
  for (const pattern of ['%"manual_rep_no":"6____"%', '%"manual_rep_no":6____%', '%"mal_rep_no":"6____"%', '%"mal_rep_no":6____%']) {
    const { data, error } = await db.from(table).select('remarks').ilike('remarks', pattern).limit(5000);
    if (error) throw new Error(error.message);
    for (const r of data || []) {
      try { const x = JSON.parse(r.remarks || '{}'); take(x.manual_rep_no); take(x.mal_rep_no); } catch { /* not JSON */ }
    }
  }
  if (top >= APP_RECEIPT_TO) throw new Error('ऐप की रसीद नंबर सीरीज़ (65001-69999) पूरी हो गई');
  return top + 1;
}

export async function POST(req: NextRequest) {
  const caller = await mobileCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { user, staff } = caller;
  if (!user.permissions?.can_collect) return NextResponse.json({ error: 'आपको पैसे जमा करने की अनुमति नहीं है' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = Number(body.customer_id);
    const amount = round(Number(body.amount));
    const mode = body.mode === 'upi' ? 'upi' : 'cash';
    const requestId = String(body.request_id || '').replace(/[^\w-]/g, '').slice(0, 40);

    if (!customerId) return NextResponse.json({ error: 'ग्राहक चुनें' }, { status: 400 });
    if (!(amount > 0) || amount > 200000) return NextResponse.json({ error: 'सही राशि डालें' }, { status: 400 });
    if (!requestId) return NextResponse.json({ error: 'request_id missing' }, { status: 400 });

    const { data: customer, error: custError } = await db.from('customer').select('customer_id, region_id').eq('customer_id', customerId).maybeSingle();
    if (custError) throw new Error(custError.message);
    if (!customer) return NextResponse.json({ error: `ग्राहक #${customerId} नहीं मिला` }, { status: 404 });
    if (!canSeeRegion(caller, customer.region_id)) return NextResponse.json({ error: 'यह ग्राहक आपकी लाइन का नहीं है' }, { status: 403 });

    const table = `receipt${fySuffix()}`;

    // A second tap on Save (or a retry after a weak network) returns the receipt already saved
    const { data: already } = await db.from(table).select('recp_no, mal_recp_amt, remarks').eq('customer_id', customerId)
      .ilike('remarks', `%"request_id":"${requestId}"%`).limit(1);
    if (already?.length) {
      const balances = await balancesFor([customerId]);
      let extra: any = {};
      try { extra = JSON.parse(already[0].remarks || '{}'); } catch { extra = {}; }
      return NextResponse.json({ ok: true, repeated: true, recp_no: already[0].recp_no, receipt_no: extra.manual_rep_no || '', amount: Number(already[0].mal_recp_amt), balance: balances.get(customerId) || 0 });
    }

    // Receipts made in the staff app (phone or tablet) get their own Ml. No. series from 65001,
    // one more each time, in place of a paper book number (as UPI receipts have 60001-60600)
    const appNo = await nextAppReceiptNo(table);

    const today = todayIndia();
    const [balances, bill, agent] = await Promise.all([balancesFor([customerId]), latestBill(customerId), collectorName(staff?.collect_id)]);
    const before = balances.get(customerId) || 0;
    const after = round(before - amount);

    const remarks = {
      bill_no: bill?.bill_id ?? null,
      manual_rep_no: String(appNo),
      mal_recp_dt: today.ddmmyyyy,
      balance: after,
      cash_chq: mode === 'upi' ? 'Online' : 'Cash',
      cheque_no: null,
      cheque_date: null,
      narr: mode === 'upi' ? 'UPI / बैंक' : '',
      agent,
      entered_by: user.id,
      entered_by_name: user.name || user.username,
      entered_at: new Date().toISOString(),
      source: 'mobile',
      request_id: requestId
    };

    // The next system receipt number; if another screen takes it at the same moment, take the one after
    let saved: any = null;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      const { data: top, error: topError } = await db.from(table).select('recp_no').order('recp_no', { ascending: false }).limit(1);
      if (topError) throw new Error(topError.message);
      const recpNo = (Number(top?.[0]?.recp_no) || 0) + 1;
      const { data, error } = await db.from(table).insert([{
        recp_no: recpNo,
        recp_date: today.ddmmyyyy,
        customer_id: customerId,
        bill_amt: bill ? bill.amount : before,
        less_amt: 0,
        mal_recp_amt: amount,
        month: bill?.month || CAL_MONTHS[today.monthIndex],
        year: bill?.year || String(today.year),
        remarks: JSON.stringify(remarks)
      }]).select('id, recp_no');
      if (!error) saved = data?.[0];
      else if (!/duplicate|unique/i.test(error.message)) throw new Error(`रसीद सेव नहीं हुई: ${error.message}`);
    }
    if (!saved) throw new Error('रसीद सेव नहीं हुई, फिर से कोशिश करें');

    // The customer's balance, as the Receipt screen keeps it (cbal is minus when owed)
    await db.from('customer').update({ due_amount: after, cbal: -after }).eq('customer_id', customerId);

    return NextResponse.json({ ok: true, recp_no: saved.recp_no, receipt_no: String(appNo), amount, balance: after });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not save' }, { status: 500 });
  }
}
