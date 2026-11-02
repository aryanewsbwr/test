import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { BackupTable, findBackupTable } from '@/lib/backupTables';
import { closeSubscriptions } from '@/lib/subscriptionStops';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const PARALLEL_ROW_WRITES = 10;

async function inParallel<T>(items: T[], work: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += PARALLEL_ROW_WRITES) {
    await Promise.all(items.slice(i, i + PARALLEL_ROW_WRITES).map(work));
  }
}

function matchOf(table: BackupTable, row: any) {
  return Object.fromEntries(table.key.map(column => [column, row[column]]));
}

async function checked(table: string, query: PromiseLike<{ error: any }>) {
  const { error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
}

// Makes one customer's bill for a month match the old software: its lines, then its header
async function replaceBill(billnoTable: string, fix: any) {
  const suffix = billnoTable.replace('billno', '');
  const lines = `bill${suffix}`;
  const { customer_id, bill_id } = fix;

  await checked(lines, supabaseAdmin.from(lines).delete().eq('bill_id', bill_id).eq('customer_id', customer_id));
  if (fix.remove) {
    await checked(`billdel${suffix}`, supabaseAdmin.from(`billdel${suffix}`).delete().eq('customer_id', customer_id).eq('month', fix.month));
    await checked(billnoTable, supabaseAdmin.from(billnoTable).delete().eq('bill_id', bill_id).eq('customer_id', customer_id));
    return;
  }
  if (fix.newHeader) await checked(billnoTable, supabaseAdmin.from(billnoTable).insert(fix.newHeader));
  if (fix.header) await checked(billnoTable, supabaseAdmin.from(billnoTable).update(fix.header).eq('bill_id', bill_id).eq('customer_id', customer_id));
  if (fix.lines.length > 0) await checked(lines, supabaseAdmin.from(lines).insert(fix.lines));
}

// GET ?table=name&from=0 returns one page of a table, in a fixed order so pages never overlap
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;

  try {
    const table = findBackupTable(req.nextUrl.searchParams.get('table') || '');
    if (!table) return NextResponse.json({ error: 'Unknown table' }, { status: 400 });

    const from = Number(req.nextUrl.searchParams.get('from') || 0);
    let query = supabaseAdmin.from(table.name).select('*', { count: 'exact' });
    for (const column of table.key) query = query.order(column, { ascending: true });

    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      // Some yearly tables were never created
      if (error.code === 'PGRST205' || error.code === '42P01') return NextResponse.json({ rows: [], total: 0, missing: true });
      throw new Error(error.message);
    }
    return NextResponse.json({ rows: data || [], total: count || 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST { table, add, update, remove } writes one batch, and fails loudly if any row does not save
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;

  try {
    const { table: tableName, add = [], update = [], remove = [], closeStops = [], setBalances = [], fixBills = [] } = await req.json();
    const table = findBackupTable(tableName);
    if (!table) return NextResponse.json({ error: 'Unknown table' }, { status: 400 });

    const failed: { row: string; error: string }[] = [];
    if (add.length > 0) {
      const { error } = await supabaseAdmin.from(table.name).insert(add);
      if (error) {
        // One bad row refuses its whole batch, so the rest are saved singly and only the bad ones reported
        await inParallel<any>(add, async row => {
          const { error: rowError } = await supabaseAdmin.from(table.name).insert(row);
          if (rowError) failed.push({ row: String(row.customer_id ?? row[table.key[0]]), error: rowError.message });
        });
      }
    }

    await inParallel<any>(update, async row => {
      const { data, error } = await supabaseAdmin.from(table.name).update(row).match(matchOf(table, row)).select(table.key[0]);
      if (error) throw new Error(`${table.name}: ${error.message}`);
      if (!data?.length) throw new Error(`${table.name}: a row to update was not found`);
    });

    await inParallel<any>(remove, async row => {
      const { error } = await supabaseAdmin.from(table.name).delete().match(matchOf(table, row));
      if (error) throw new Error(`${table.name}: ${error.message}`);
    });

    await inParallel<any>(closeStops, stop => closeSubscriptions(Number(stop.customer_id), Number(stop.publica_id) || 0, stop.temp_from));

    await inParallel<any>(fixBills, fix => replaceBill(table.name, fix));

    await inParallel<any>(setBalances, async ({ customer_id, cbal }) => {
      const { error } = await supabaseAdmin.from('customer').update({ cbal, due_amount: -cbal }).eq('customer_id', customer_id);
      if (error) throw new Error(`customer ${customer_id}: ${error.message}`);
    });

    return NextResponse.json({ success: true, failed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
