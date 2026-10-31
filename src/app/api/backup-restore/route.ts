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
    const { table: tableName, add = [], update = [], remove = [], closeStops = [] } = await req.json();
    const table = findBackupTable(tableName);
    if (!table) return NextResponse.json({ error: 'Unknown table' }, { status: 400 });

    if (add.length > 0) {
      const { error } = await supabaseAdmin.from(table.name).insert(add);
      if (error) throw new Error(`${table.name}: ${error.message}`);
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
