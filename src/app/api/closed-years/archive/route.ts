import { NextRequest, NextResponse } from 'next/server';
import zlib from 'zlib';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { fyStartYear } from '@/lib/financialYear';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Moves a closed year out of the database, so the free 500 MB database never fills (the way
// 2019-20 to 2024-25 were moved on 13 Nov 2026). The year's bill, billno, billdel and receipt tables
// are each saved as one gzipped JSON file { table, rows_count, rows } in the same place backups
// read closed years from, read back and counted, and only then removed by the database function
// archive_closed_year (supabase/archive_closed_year.sql), which checks the counts again.
//   POST { fy: '20252026', table: 'bill20252026' }  save one table's file  -> { table, rows }
//   POST { fy: '20252026', remove: true }           remove the year's tables once all files match
const BUCKET = 'old-software-base';
const FOLDER = 'closed-years';
const KINDS = ['bill', 'billno', 'billdel', 'receipt'];
const KEY: Record<string, string> = { bill: 'id', billno: 'bill_id', billdel: 'id', receipt: 'id' };

// Only a year at least two years old: the running year and the year just closed stay
const movable = (fy: string) => /^\d{8}$/.test(fy) && Number(fy.slice(4)) === Number(fy.slice(0, 4)) + 1
  && Number(fy.slice(0, 4)) <= fyStartYear(new Date()) - 2;

async function readAll(table: string, key: string): Promise<any[] | null> {
  // A real read (not a head request: that one does not report a missing table)
  const { count, error, status } = await supabaseAdmin.from(table).select('*', { count: 'exact' }).limit(1);
  if (error || status === 404) {
    if (status === 404 || error?.code === 'PGRST205' || /does not exist|schema cache/i.test(error?.message || '')) return null;
    throw new Error(`${table}: ${error?.message}`);
  }
  const pages = Math.ceil((count || 0) / 1000);
  const out: any[][] = new Array(pages);
  for (let p = 0; p < pages; p += 8) {
    await Promise.all(Array.from({ length: Math.min(8, pages - p) }, async (_, i) => {
      const page = p + i;
      const { data, error: e } = await supabaseAdmin.from(table).select('*').order(key, { ascending: true }).range(page * 1000, page * 1000 + 999);
      if (e) throw new Error(`${table}: ${e.message}`);
      out[page] = data || [];
    }));
  }
  return out.flat();
}

async function readFile(table: string): Promise<{ rows_count: number; rows: any[] } | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(`${FOLDER}/${table}.json.gz`);
  if (error || !data) return null;
  const kept = JSON.parse(zlib.gunzipSync(Buffer.from(await data.arrayBuffer())).toString('utf8'));
  return { rows_count: Number(kept.rows_count), rows: kept.rows || [] };
}

export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  const body = await req.json().catch(() => ({}));
  const fy = String(body.fy || '');
  if (!movable(fy)) return NextResponse.json({ error: `${fy} अभी फ़ाइल में नहीं भेजा जा सकता (चालू या पिछला साल)` }, { status: 400 });

  try {
    if (body.table) {
      const table = String(body.table);
      const kind = KINDS.find(k => table === `${k}${fy}`);
      if (!kind) return NextResponse.json({ error: 'Unknown table' }, { status: 400 });
      const rows = await readAll(table, KEY[kind]);
      if (rows === null) {
        // Already removed: its file must be there
        const kept = await readFile(table);
        return kept ? NextResponse.json({ table, rows: kept.rows_count, already: true }) : NextResponse.json({ table, rows: 0, none: true });
      }
      // Never replace a kept file with a smaller one (e.g. an empty table)
      const before = await readFile(table);
      if (before && before.rows.length > rows.length) {
        throw new Error(`${table}: database has ${rows.length} rows but the kept file has ${before.rows.length}; the file was not touched`);
      }
      if (!rows.length) return NextResponse.json({ table, rows: 0, none: true });
      const file = zlib.gzipSync(Buffer.from(JSON.stringify({ table, rows_count: rows.length, rows })));
      const { error } = await supabaseAdmin.storage.from(BUCKET).upload(`${FOLDER}/${table}.json.gz`, file, { contentType: 'application/gzip', upsert: true });
      if (error) throw new Error(`${table}: file not saved (${error.message})`);
      // Read it back: every row must be there
      const kept = await readFile(table);
      if (!kept || kept.rows.length !== rows.length || kept.rows_count !== rows.length) throw new Error(`${table}: the saved file does not match`);
      return NextResponse.json({ table, rows: rows.length });
    }

    if (body.remove) {
      const counts: Record<string, number> = {};
      for (const kind of KINDS) {
        const table = `${kind}${fy}`;
        const kept = await readFile(table);
        if (kept) counts[table] = kept.rows.length;
      }
      const { data, error } = await supabaseAdmin.rpc('archive_closed_year', { fy, counts });
      if (error) {
        if (error.code === 'PGRST202') return NextResponse.json({ error: 'पुराना साल हटाना अभी चालू नहीं है: supabase/archive_closed_year.sql एक बार SQL Editor में चलाना बाकी है। फ़ाइलें सुरक्षित बन गई हैं, डेटा नहीं हटा।' }, { status: 400 });
        throw new Error(error.message);
      }
      return NextResponse.json({ ...data, counts });
    }
    return NextResponse.json({ error: 'table or remove is required' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: `पुराना साल फ़ाइल में नहीं गया: ${err.message || err}` }, { status: 500 });
  }
}
