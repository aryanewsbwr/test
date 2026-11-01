// Replaces one month's saved bills for a set of customers, all or nothing.

const CHUNK_SIZE = 100;
const BATCH_SIZE = 500;

export interface BillTables {
  billno: string;
  bill: string;
  billdel: string;
}

export interface MonthBillRows {
  headers: any[];
  lines: any[];
  deliveries: any[];
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function run(query: any): Promise<any[]> {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Restored rows get a fresh id from the table
function withoutId({ id, ...row }: any) {
  return row;
}

export async function replaceMonthBills(
  db: any,
  tables: BillTables,
  month: string,
  customerIds: number[],
  rows: MonthBillRows
): Promise<void> {
  if (rows.headers.length === 0) throw new Error('No bills were calculated, so the saved bills were left as they are.');

  const monthName = month.trim();
  const monthFilter = `month.ilike.${monthName},month.ilike.${monthName.slice(0, 3)}%`;
  const customerChunks = chunks(customerIds, CHUNK_SIZE);

  // 1. Keep a copy of what is there, so a failed save can put it back
  const oldHeaders: any[] = [];
  const oldLines: any[] = [];
  const oldDeliveries: any[] = [];
  for (const ids of customerChunks) {
    const headers = await run(db.from(tables.billno).select('*').in('customer_id', ids).or(monthFilter));
    oldHeaders.push(...headers);
    if (headers.length > 0) {
      oldLines.push(...await run(db.from(tables.bill).select('*').in('bill_id', headers.map(h => h.bill_id)).in('customer_id', ids)));
    }
    oldDeliveries.push(...await run(db.from(tables.billdel).select('*').in('customer_id', ids).or(monthFilter)));
  }

  const clearCustomers = async (lineFilter: 'old' | 'all') => {
    if (lineFilter === 'old') {
      // By customer too, so a reused bill number can never take another customer's lines
      for (const headers of chunks(oldHeaders, CHUNK_SIZE)) {
        await run(db.from(tables.bill).delete().in('bill_id', headers.map(h => h.bill_id)).in('customer_id', headers.map(h => h.customer_id)));
      }
    }
    for (const ids of customerChunks) {
      if (lineFilter === 'all') await run(db.from(tables.bill).delete().in('customer_id', ids).or(monthFilter));
      await run(db.from(tables.billno).delete().in('customer_id', ids).or(monthFilter));
      await run(db.from(tables.billdel).delete().in('customer_id', ids).or(monthFilter));
    }
  };

  try {
    await clearCustomers('old');
    // Insert, never upsert: a bill number already taken by another run must fail, not overwrite that bill
    for (const batch of chunks(rows.headers, BATCH_SIZE)) await run(db.from(tables.billno).insert(batch));
    for (const batch of chunks(rows.lines, BATCH_SIZE)) await run(db.from(tables.bill).insert(batch));
  } catch (saveErr: any) {
    try {
      await clearCustomers('all');
      for (const batch of chunks(oldHeaders, BATCH_SIZE)) await run(db.from(tables.billno).insert(batch));
      for (const batch of chunks(oldLines.map(withoutId), BATCH_SIZE)) await run(db.from(tables.bill).insert(batch));
      for (const batch of chunks(oldDeliveries.map(withoutId), BATCH_SIZE)) await run(db.from(tables.billdel).insert(batch));
    } catch (restoreErr: any) {
      throw new Error(`Bills were not saved and the old bills could not be put back (${restoreErr.message}). Restore from backup before printing.`);
    }
    if (saveErr.code === '23505') {
      throw new Error('Another bill run is using the same bill numbers. Your old bills are safe. Wait for it to finish and run this again.');
    }
    throw new Error(`Bills were not saved, so your old bills were kept: ${saveErr.message}`);
  }

  // Delivery rows only feed the print layout, and a repeat of the same paper may clash
  for (const batch of chunks(rows.deliveries, BATCH_SIZE)) {
    const { error } = await db.from(tables.billdel).upsert(batch);
    if (error) console.warn('billdel insert note:', error);
  }
}
