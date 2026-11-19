import { NextRequest, NextResponse } from 'next/server';
import { refuseWithout } from '@/lib/auth';
import { buildReport, REPORTS } from '@/lib/tableReports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// GET ?type=collection_datewise&from=2026-11-01&to=2026-11-17&region=11&hawker=&pub=&publisher=&collector=
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  const p = req.nextUrl.searchParams;
  const type = String(p.get('type') || '');
  if (!REPORTS[type]) return NextResponse.json({ error: `Unknown report: ${type}` }, { status: 400 });
  const num = (k: string) => Number(p.get(k)) || 0;
  // hawker=12 or 12,40,77 (one name with several hawker numbers)
  const hawkers = String(p.get('hawker') || '').split(',').map(Number).filter(n => n > 0);
  const from = String(p.get('from') || '');
  const to = String(p.get('to') || '');
  // book=101-200: one receipt book
  const bm = String(p.get('book') || '').match(/^(\d+)-(\d+)$/);
  try {
    const report = await buildReport(type, {
      from: isDate(from) ? from : '', to: isDate(to) ? to : '',
      region: num('region'), hawker: hawkers[0] || 0, hawkers, pub: num('pub'), publisher: num('publisher'), collector: num('collector'),
      bookFrom: bm ? Number(bm[1]) : 0, bookTo: bm ? Number(bm[2]) : 0
    });
    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not make the report' }, { status: 500 });
  }
}
