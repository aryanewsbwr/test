import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/status?month=October 2026[&month=...]
 * Lists the customers whose bill for those months went out on WhatsApp, newest send per customer.
 */
export async function GET(request: NextRequest) {
  try {
    const months = new URL(request.url).searchParams.getAll('month').filter(Boolean);
    if (months.length === 0) {
      return NextResponse.json({ error: 'month is required' }, { status: 400 });
    }

    const latest = new Map<string, { customer_id: string; bill_month: string; status: string; sent_at: string }>();
    const PAGE_SIZE = 1000;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from('whatsapp_messages')
        .select('customer_id, bill_month, status, created_at')
        .in('bill_month', months)
        .in('status', ['sent', 'delivered', 'read'])
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      for (const row of data || []) {
        latest.set(`${row.customer_id}|${row.bill_month}`, {
          customer_id: row.customer_id,
          bill_month: row.bill_month,
          status: row.status,
          sent_at: row.created_at
        });
      }
      if (!data || data.length < PAGE_SIZE) break;
    }

    return NextResponse.json({ sent: Array.from(latest.values()) });
  } catch (err: any) {
    console.error('WhatsApp status error:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
