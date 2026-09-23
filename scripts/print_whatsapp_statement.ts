import fs from 'fs';
import path from 'path';
import { supabase } from '../src/lib/supabaseClient';
import { calculateBilling } from '../src/lib/billingEngine';

function loadJson(filename: string) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', filename), 'utf-8'));
}

async function run() {
  const custs = loadJson('all_customers.json');
  const targetCust = custs.find((c: any) => c.customer_id === 24669);
  const rates = loadJson('rates.json');
  const ratechanges = loadJson('ratechanges.json');
  const pubs = loadJson('publications.json');
  const holidays = loadJson('holidays.json');
  const discontinues = loadJson('discontinues.json');

  const { data: pubDis } = await supabase.from('publicationdis').select('*');
  const { data: rawSubs } = await supabase.from('customer_detailback').select('*').eq('Customer_id', 24669);
  const { data: liveBills } = await supabase.from('bill').select('*').eq('customer_id', 24669).eq('financial_year', '2026-2027');
  const { data: liveReceipts } = await supabase.from('receipt').select('*').eq('customer_id', 24669).eq('financial_year', '2026-2027');

  const months = ['May', 'June', 'July', 'August'];

  for (const m of months) {
    const res = calculateBilling({
      monthName: m,
      year: '2026',
      regionId: 'all',
      customers: [targetCust],
      subscriptions: rawSubs || [],
      rates: rates,
      ratechanges: ratechanges,
      publications: pubs,
      holidays: holidays,
      discontinues: discontinues,
      publicationDiscontinues: pubDis || [],
      bills: liveBills || [],
      receipts: liveReceipts || [],
      retailSales: []
    });

    const b = res.bills[0];
    console.log(`\n============================================================`);
    console.log(`MONTH: ${m.toUpperCase()} 2026`);
    console.log(`============================================================`);
    console.log(`Customer: #${b.customer_id} ${b.name_eng} | Region: #120 (Whatsapp)`);
    console.log(`Opening Dues / Carried Forward: Rs. ${b.previous_due.toFixed(2)}`);
    console.log(`Paper Amount: Rs. ${b.paper_amount.toFixed(2)}`);
    console.log(`Delivery Charge: Rs. ${b.delivery_amount.toFixed(2)}`);
    console.log(`Discount: Rs. ${b.discount_amount.toFixed(2)}`);
    console.log(`Current Month Total: Rs. ${b.current_month_charges.toFixed(2)}`);
    console.log(`Grand Total Payable: Rs. ${b.total_payable.toFixed(2)}`);
    console.log(`\nLine-by-Line Breakup:`);
    for (const item of b.breakup) {
      if (item.sort_order === 1) {
        console.log(`  - [Paper] ${item.item}: ${item.days_or_copies} copies/days @ Rs. ${item.rate} = Rs. ${item.amount.toFixed(2)}`);
      } else if (item.sort_order === 2) {
        console.log(`  - [Delivery] ${item.item}: Rs. ${item.amount.toFixed(2)}`);
      } else if (item.sort_order === 3) {
        console.log(`  - [Discount] ${item.item}: Rs. ${item.amount.toFixed(2)}`);
      }
    }
  }
}

run().catch(console.error);
