import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Closed years moved out of the database to keep it small (2019-20 to 2024-25 on 13 Nov 2026).
// Each table is kept as one gzipped JSON file, { table, rows_count, rows }, in the private bucket
// beside the old software's history. Backups read a year from here when the database no longer has it.
const BUCKET = 'old-software-base';
const FOLDER = 'closed-years';
const TABLE = /^(bill|billno|billdel|receipt)\d{8}$/;

// GET ?table=bill20192020 -> { url } a short-lived download link, or { missing: true }
// GET (no table) -> { tables: [...] } the tables kept here
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  const table = req.nextUrl.searchParams.get('table') || '';

  if (!table) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(FOLDER, { limit: 500 });
    if (error) return NextResponse.json({ tables: [] });
    return NextResponse.json({
      tables: (data || []).map(f => f.name.replace(/\.json\.gz$/, '')).filter(n => TABLE.test(n)).sort()
    });
  }

  if (!TABLE.test(table)) return NextResponse.json({ error: 'Unknown table' }, { status: 400 });
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(`${FOLDER}/${table}.json.gz`, 600);
  if (error || !data) return NextResponse.json({ missing: true });
  return NextResponse.json({ url: data.signedUrl });
}

// POST { table } -> { url } an upload link for that table's file (replaces it if already kept)
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  const body = await req.json().catch(() => ({}));
  const table = String(body.table || '');
  if (!TABLE.test(table)) return NextResponse.json({ error: 'Unknown table' }, { status: 400 });
  const { data, error } = await supabaseAdmin.storage.from(BUCKET)
    .createSignedUploadUrl(`${FOLDER}/${table}.json.gz`, { upsert: true });
  if (error || !data) return NextResponse.json({ error: error?.message || 'No upload link' }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
