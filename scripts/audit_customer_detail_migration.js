const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
let url = '', key = '';
env.split('\n').forEach(l => {
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim();
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

async function analyze() {
  console.log('Fetching customer IDs from customer table...');
  const allCustIds = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('customer').select('customer_id').range(from, from + 999);
    if (error) { console.error('Cust fetch error:', error); break; }
    if (!data || data.length === 0) break;
    data.forEach(c => allCustIds.add(c.customer_id));
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log('Total unique customer_ids in customer table:', allCustIds.size);

  console.log('Fetching customer_detailback rows to analyze dates and orphans...');
  let totalRows = 0;
  let orphans = 0;
  const orphanSample = [];
  let sDateFailed = 0;
  let cDateFailed = 0;
  const sDateFailSample = [];
  const cDateFailSample = [];
  let validSDateCount = 0;
  let validCDateCount = 0;
  let emptyCDateCount = 0;

  from = 0;
  while (true) {
    const { data, error } = await supabase.from('customer_detailback')
      .select('sno, Customer_id, S_Date, C_Date')
      .range(from, from + 999);
    if (error) { console.error('CDB fetch error:', error); break; }
    if (!data || data.length === 0) break;

    for (const row of data) {
      totalRows++;
      if (!allCustIds.has(row.Customer_id)) {
        orphans++;
        if (orphanSample.length < 10) orphanSample.push(row);
      }

      // S_Date analysis
      const s = (row.S_Date || '').trim();
      if (!s) {
        sDateFailed++;
        if (sDateFailSample.length < 10) sDateFailSample.push({ sno: row.sno, val: row.S_Date });
      } else {
        const parts = s.split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const y = parseInt(parts[2], 10);
          if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
            validSDateCount++;
          } else {
            sDateFailed++;
            if (sDateFailSample.length < 10) sDateFailSample.push({ sno: row.sno, val: row.S_Date });
          }
        } else {
          sDateFailed++;
          if (sDateFailSample.length < 10) sDateFailSample.push({ sno: row.sno, val: row.S_Date });
        }
      }

      // C_Date analysis
      const c = (row.C_Date || '').trim();
      if (!c || c === 'null' || c === '-') {
        emptyCDateCount++;
      } else {
        const parts = c.split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const y = parseInt(parts[2], 10);
          if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
            validCDateCount++;
          } else {
            cDateFailed++;
            if (cDateFailSample.length < 10) cDateFailSample.push({ sno: row.sno, val: row.C_Date });
          }
        } else {
          cDateFailed++;
          if (cDateFailSample.length < 10) cDateFailSample.push({ sno: row.sno, val: row.C_Date });
        }
      }
    }

    if (totalRows % 10000 === 0) console.log('Processed', totalRows, 'rows...');
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log('\n=== COMPLETE AUDIT & MIGRATION ANALYSIS RESULTS ===');
  console.log('Total customer_detailback rows processed:', totalRows);
  console.log('Total orphaned rows (Customer_id not in customer table):', orphans);
  console.log('Sample orphans:', JSON.stringify(orphanSample, null, 2));
  console.log('S_Date valid count:', validSDateCount);
  console.log('S_Date failed count (to_date would fail):', sDateFailed);
  console.log('S_Date fail sample:', JSON.stringify(sDateFailSample, null, 2));
  console.log('C_Date empty/null/open (ongoing subscription):', emptyCDateCount);
  console.log('C_Date valid count:', validCDateCount);
  console.log('C_Date failed count (to_date would fail):', cDateFailed);
  console.log('C_Date fail sample:', JSON.stringify(cDateFailSample, null, 2));
}

analyze();
