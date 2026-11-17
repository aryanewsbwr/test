import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { fySuffix } from '@/lib/financialYear';
import { getPublicationPeriodicityAndRates } from '@/lib/rateEngine';
import { cleanOrTransliterateHindi, sushaToUnicode } from '@/lib/transliteration';
import { GET as subscriptionsGET } from '@/app/api/subscriptions/route';
import {
  mobileCaller, canSeeRegion, regionNames, customerCard, phonesOf, balancesFor, latestBill,
  nextBookNumber, todayIndia, HINDI_MONTHS
} from '@/lib/mobile';

export const dynamic = 'force-dynamic';

const PERIOD_HINDI: Record<string, string> = {
  Weekly: 'हफ़्ते में', Fortnightly: '15 दिन में', Monthly: 'महीने में', Quarterly: '3 महीने में', Special: 'खास अंक'
};

function receiptDetails(r: any) {
  let extra: any = {};
  try { extra = JSON.parse(r.remarks || '{}'); } catch { extra = {}; }
  return {
    date: extra.mal_recp_dt || r.recp_date || '',
    amount: Number(r.mal_recp_amt || 0),
    receipt_no: extra.manual_rep_no || r.recp_no || '',
    by: extra.entered_by_name || ''
  };
}

// GET ?id=5179 -> the customer page: name, address, phones, balance, running papers, last payment,
// and what the payment screen fills in (bill month, next receipt no.)
export async function GET(req: NextRequest) {
  const caller = await mobileCaller(req);
  if (caller instanceof NextResponse) return caller;
  try {
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'ग्राहक नं. चाहिए' }, { status: 400 });
    // Everything the page needs is read at the same time: each read waits on the database,
    // and one after another they took several seconds
    const subscriptions = subscriptionsGET(new NextRequest(new URL(`/api/subscriptions?customer_id=${id}&active_only=true`, req.nextUrl.origin)))
      .then(r => r.json()).then(j => (j.subscriptions || []) as any[]);
    const [{ data: c, error }, names, subs, { data: pubs }, rates, balances, bill, book, { data: receipts }] = await Promise.all([
      db.from('customer').select('*').eq('customer_id', id).maybeSingle(),
      regionNames(),
      subscriptions,
      db.from('publication').select('publica_id, public_name, pub_hindi, type_p, duration, magzine_day'),
      // Which papers are daily: a paper with a rate for each weekday (the rate rows of this customer's papers)
      subscriptions.then(async list => {
        const ids = Array.from(new Set(list.map(x => Number(x.publica_id))));
        if (!ids.length) return [] as any[];
        const { data } = await db.from('rate').select('*').in('publica_id', ids);
        return (data || []) as any[];
      }),
      balancesFor([id]),
      latestBill(id),
      nextBookNumber(caller.staff?.collect_id),
      db.from(`receipt${fySuffix()}`).select('recp_no, recp_date, mal_recp_amt, remarks').eq('customer_id', id).order('id', { ascending: false }).limit(1)
    ]);
    if (error) throw new Error(error.message);
    if (!c) return NextResponse.json({ error: `ग्राहक #${id} नहीं मिला` }, { status: 404 });
    if (!canSeeRegion(caller, c.region_id)) return NextResponse.json({ error: 'यह ग्राहक आपकी लाइन का नहीं है' }, { status: 403 });

    const card = customerCard(c, rid => names.get(rid) || '');
    const rawHindi = String(c.hindi_add || '').trim();
    const hindiAddress = rawHindi ? (/[ऀ-ॿ]/.test(rawHindi) ? rawHindi : sushaToUnicode(rawHindi)) : '';
    const address = (hindiAddress || [c.add1, c.add2].filter(Boolean).join(', ')).replace(/(?:\+?91[\s-]?)?[6-9]\d{9}/g, '').replace(/[,\s]+$/, '').trim();

    const today = todayIndia();
    const papers = subs.map(s => {
      const p: any = (pubs || []).find((x: any) => Number(x.publica_id) === Number(s.publica_id));
      const english = String(p?.public_name || s.publication_name || '').trim();
      const name = p?.pub_hindi ? cleanOrTransliterateHindi(p.pub_hindi, english) : english;
      const info = p ? getPublicationPeriodicityAndRates(p, today.iso, (rates || []) as any, []) : null;
      const qty = Number(s.qty || 1);
      const how = !info || info.isDaily ? `रोज़ ${qty}` : `${PERIOD_HINDI[info.periodicity] || ''}${qty > 1 ? ` · ${qty}` : ''}`;
      const hold = s.hold_info?.is_on_hold ? `छुट्टी ${s.hold_info.from} – ${s.hold_info.to}` : '';
      return { sno: s.sno, publica_id: Number(s.publica_id), name, english, how, hold };
    });

    const balance = balances.get(id) || 0;

    return NextResponse.json({
      ...card,
      address,
      phones: phonesOf(c),
      balance,
      papers,
      last_payment: receipts?.[0] ? receiptDetails(receipts[0]) : null,
      bill: bill ? { ...bill, month_hindi: HINDI_MONTHS[bill.month] || bill.month } : null,
      receipt_book: book,
      can_collect: !!caller.user.permissions?.can_collect
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not read the customer' }, { status: 500 });
  }
}
