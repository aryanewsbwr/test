import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateBilling } from '@/lib/billingEngine';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mekibdmvpkkujqpfqwyt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = parseInt(searchParams.get('customer_id') || '108', 10);
    const month = searchParams.get('month') || 'April';
    const year = searchParams.get('year') || '2025';

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Fetch raw rows directly from live Supabase tables
    const [
      receiptsRes,
      billnoRes,
      billItemsRes,
      customerRes,
      subsRes,
      pubsRes,
      holidaysRes,
      discontinueRes
    ] = await Promise.all([
      supabase.from('receipt20252026').select('*').eq('customer_id', customerId).order('Receipt_id', { ascending: true }),
      supabase.from('billno20252026').select('*').eq('Customer_id', customerId).order('Bill_id', { ascending: true }),
      supabase.from('bill20252026').select('*').eq('Customer_id', customerId).order('Bill_id', { ascending: true }),
      supabase.from('customer').select('*').eq('customer_id', customerId),
      supabase.from('customer_detail').select('*').eq('customer_id', customerId),
      supabase.from('publications').select('*'),
      supabase.from('holiday').select('*').gte('oc_date', '2025-01-01').lte('oc_date', '2026-04-30'),
      supabase.from('discontinue').select('*').eq('customer_id', customerId)
    ]);

    const rawReceipts = receiptsRes.data || [];
    const rawBillno = billnoRes.data || [];
    const rawBillItems = billItemsRes.data || [];
    const customer = customerRes.data || [];
    const subs = subsRes.data || [];
    const pubs = pubsRes.data || [];
    const holidays = holidaysRes.data || [];
    const discontinues = discontinueRes.data || [];

    // Extract publication IDs
    const pubIds = Array.from(new Set(subs.map((s: any) => s.publication_id || s.publica_id || s.Publica_id).filter(Boolean)));

    // Fetch rate and ratechange specifically for these publications (bypasses 1000 row max limit)
    const [ratesRes, rateChangesRes] = await Promise.all([
      pubIds.length > 0 ? supabase.from('rate').select('*').in('Publica_id', pubIds) : supabase.from('rate').select('*'),
      pubIds.length > 0 ? supabase.from('ratechange').select('*').in('Publica_id', pubIds) : supabase.from('ratechange').select('*')
    ]);

    const rates = ratesRes.data || [];
    const ratechanges = rateChangesRes.data || [];

    // Filter raw bill items for the requested month
    const dbMonthBillItems = rawBillItems.filter(b => 
      (b.Month || '').toLowerCase().trim() === month.toLowerCase().trim()
    );
    const dbMonthPaperTotal = dbMonthBillItems.reduce((acc, x) => acc + Number(x.TotalAmt || 0), 0);

    // Find raw billno header for requested month
    const dbMonthBillno = rawBillno.find(b => 
      (b.Month || '').toLowerCase().trim() === month.toLowerCase().trim()
    ) || null;

    // Run calculateBilling using live Supabase data
    const calculation = calculateBilling({
      monthName: month,
      year: year,
      regionId: 'all',
      customers: customer,
      subscriptions: subs,
      rates: rates,
      ratechanges: ratechanges,
      publications: pubs,
      holidays: holidays,
      discontinues: discontinues,
      bills: rawBillItems,
      billHeaders: rawBillno,
      receipts: rawReceipts,
      regions: []
    });

    const computedBill = calculation.bills[0] || null;

    return NextResponse.json({
      query: {
        customer_id: customerId,
        month: month,
        year: year
      },
      raw_database: {
        receipts: rawReceipts,
        billno: rawBillno,
        bill_items_for_month: dbMonthBillItems
      },
      computed_bill: computedBill,
      comparison: {
        db_month_paper_total: Math.round(dbMonthPaperTotal * 100) / 100,
        computed_paper_amount: computedBill ? computedBill.paper_amount : null,
        db_month_delivery: dbMonthBillno ? Number(dbMonthBillno.Del_Amt || 0) : null,
        computed_delivery: computedBill ? computedBill.delivery_amount : null,
        db_month_previous_due_or_bal: dbMonthBillno ? Number(dbMonthBillno.Balance || dbMonthBillno.Due_Amt || 0) : null,
        computed_previous_due: computedBill ? computedBill.previous_due : null,
        computed_total_payable: computedBill ? computedBill.total_payable : null
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
