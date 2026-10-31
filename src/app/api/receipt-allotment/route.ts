import { NextRequest, NextResponse } from 'next/server';
import { fySuffix } from '@/lib/financialYear';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export interface ReceiptAllotmentRecord {
  id?: string | number;
  sno: number;
  collect_id?: number | null;
  collector_name: string;
  receipt_from: number;
  receipt_to: number;
  allot_date: string;
  rec_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

function formatDateToDDMMYYYY(dStr?: string | null): string {
  if (!dStr) return '';
  const s = String(dStr).trim();
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const dd = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD -> DD/MM/YYYY
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      } else {
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
  }
  return s;
}

function formatDateToYYYYMMDD(dStr?: string | null): string {
  if (!dStr) return '';
  const s = String(dStr).trim();
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const dd = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return s;
}

function sortAndIndexAllotments(list: ReceiptAllotmentRecord[]): ReceiptAllotmentRecord[] {
  const sorted = [...list].sort((a, b) => {
    if ((a.collector_name || '').toLowerCase() !== (b.collector_name || '').toLowerCase()) {
      return (a.collector_name || '').localeCompare(b.collector_name || '', undefined, { sensitivity: 'base' });
    }
    return (Number(a.sno) || 0) - (Number(b.sno) || 0);
  });

  // Ensure clean sequential 1, 2, 3... sno per collector
  const collectorCounters: Record<string, number> = {};
  return sorted.map(item => {
    const key = (item.collector_name || '').toLowerCase();
    collectorCounters[key] = (collectorCounters[key] || 0) + 1;
    return {
      ...item,
      sno: item.sno || collectorCounters[key]
    };
  });
}

async function loadCollectors() {
  const { data, error } = await supabaseAdmin.from('collect').select('*');
  if (error) throw new Error(`Could not read collection agents: ${error.message}`);
  return (data || []).map((c: any) => ({
    collect_id: c.Collect_id,
    name: c.name || `Collector #${c.Collect_id}`
  })).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
}

// This year's books, from receiptissue<year> with the old software's column names
async function loadAllotments(collectors: { collect_id: number; name: string }[]): Promise<ReceiptAllotmentRecord[]> {
  const table = `receiptissue${fySuffix()}`;
  const { data, error } = await supabaseAdmin.from(table).select('*').order('sno', { ascending: true }).limit(10000);
  if (error) {
    throw new Error(error.code === 'PGRST205'
      ? `The ${table} table does not exist yet. Run supabase/move_json_to_database.sql in Supabase first.`
      : `Could not read receipt books: ${error.message}`);
  }
  const colMap = Object.fromEntries(collectors.map(c => [c.collect_id, c.name]));
  return sortAndIndexAllotments((data || []).map((item: any) => ({
    sno: Number(item.sno) || 1,
    collect_id: item.Collect_id,
    collector_name: colMap[item.Collect_id] || ('Collector ' + item.Collect_id),
    receipt_from: Number(item.ReceiptFrom) || 0,
    receipt_to: Number(item.ReceiptTo) || 0,
    allot_date: formatDateToDDMMYYYY(item.IssueDate),
    rec_date: item.RecDate ? formatDateToDDMMYYYY(item.RecDate) : null
  })));
}

/**
 * GET /api/receipt-allotment
 * Query Params:
 * - collector_name (optional)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const collectorName = searchParams.get('collector_name');

    const collectors = await loadCollectors();
    const allotments = await loadAllotments(collectors);

    let filtered: ReceiptAllotmentRecord[] = [];
    if (collectorName && collectorName.trim()) {
      filtered = allotments.filter(a => 
        (a.collector_name || '').toLowerCase() === collectorName.trim().toLowerCase()
      );
    }

    return NextResponse.json({
      success: true,
      allotments: filtered,
      all_allotments: allotments,
      collectors: collectors
    });
  } catch (error: any) {
    console.error('Error fetching receipt allotments:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/receipt-allotment
 * Body:
 * - collector_name: string
 * - receipt_from: number
 * - receipt_to: number
 * - allot_date: string
 * - rec_date?: string | null
 * - edit_sno?: number (if editing existing row for this collector)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { collector_name, receipt_from, receipt_to, allot_date, rec_date, edit_sno } = body;

    if (!collector_name || !collector_name.trim()) {
      return NextResponse.json({ success: false, error: 'Collector / Hawker name is required.' }, { status: 400 });
    }

    const fromNum = parseInt(String(receipt_from), 10);
    const toNum = parseInt(String(receipt_to), 10);

    if (isNaN(fromNum) || isNaN(toNum) || fromNum <= 0 || toNum <= 0) {
      return NextResponse.json({ success: false, error: 'Valid Receipt From and Receipt To numbers are required.' }, { status: 400 });
    }

    if (toNum < fromNum) {
      return NextResponse.json({ success: false, error: 'Receipt To number must be greater than or equal to Receipt From number.' }, { status: 400 });
    }

    // Resolve collect_id
    const collectors = await loadCollectors();
    const cleanName = collector_name.trim();
    const matchedCol = collectors.find(c => (c.name || '').toLowerCase() === cleanName.toLowerCase());
    if (!matchedCol) {
      return NextResponse.json({ success: false, error: `"${cleanName}" is not a collection agent. Add them in Collection Agent first.` }, { status: 400 });
    }
    const collectId = matchedCol.collect_id;

    const allotments = await loadAllotments(collectors);

    // Check for range overlap with other 2026-2027 allotments
    for (const item of allotments) {
      const isSameItem = edit_sno && (item.collector_name.toLowerCase() === cleanName.toLowerCase()) && item.sno === edit_sno;
      if (!isSameItem) {
        const itemFrom = item.receipt_from;
        const itemTo = item.receipt_to;
        if (Math.max(fromNum, itemFrom) <= Math.min(toNum, itemTo)) {
          return NextResponse.json({
            success: false,
            error: `Receipt range ${fromNum}-${toNum} overlaps with existing allotment (${itemFrom}-${itemTo}) allotted to ${item.collector_name}.`
          }, { status: 400 });
        }
      }
    }

    const formattedAllotDate = formatDateToDDMMYYYY(allot_date || '12/10/2026');
    const formattedRecDate = rec_date ? formatDateToDDMMYYYY(rec_date) : null;
    const dbIssueDate = formatDateToYYYYMMDD(formattedAllotDate);

    const table = `receiptissue${fySuffix()}`;
    const fields = {
      ReceiptFrom: String(fromNum),
      ReceiptTo: String(toNum),
      IssueDate: dbIssueDate,
      RecDate: formattedRecDate ? formatDateToYYYYMMDD(formattedRecDate) : null
    };
    if (edit_sno) {
      const { data, error } = await supabaseAdmin.from(table).update(fields).eq('Collect_id', collectId).eq('sno', edit_sno).select();
      if (error) throw new Error(`Could not save receipt book: ${error.message}`);
      if (!data?.length) return NextResponse.json({ success: false, error: 'That receipt book was not found.' }, { status: 404 });
    } else {
      const collectorItems = allotments.filter(a => Number(a.collect_id) === Number(collectId));
      const nextSno = collectorItems.length > 0 ? Math.max(...collectorItems.map(a => a.sno)) + 1 : 1;
      const { error } = await supabaseAdmin.from(table).insert({ sno: nextSno, Collect_id: collectId, ...fields });
      if (error) throw new Error(`Could not save receipt book: ${error.message}`);
    }

    const sortedAll = await loadAllotments(collectors);

    const collectorFiltered = sortedAll.filter(a => 
      a.collector_name.toLowerCase() === cleanName.toLowerCase()
    );

    return NextResponse.json({
      success: true,
      message: 'Receipt allotment saved successfully to receiptissue20262027!',
      allotments: collectorFiltered,
      all_allotments: sortedAll
    });
  } catch (error: any) {
    console.error('Error saving receipt allotment:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/receipt-allotment
 * Query Params:
 * - collector_name: string
 * - sno: number
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const collectorName = searchParams.get('collector_name');
    const snoStr = searchParams.get('sno');

    if (!collectorName || !snoStr) {
      return NextResponse.json({ success: false, error: 'collector_name and sno are required.' }, { status: 400 });
    }

    const sno = parseInt(snoStr, 10);
    const cleanName = collectorName.trim();

    const collectors = await loadCollectors();
    const matchedCol = collectors.find(c => (c.name || '').toLowerCase() === cleanName.toLowerCase());
    if (!matchedCol) return NextResponse.json({ success: false, error: `"${cleanName}" is not a collection agent.` }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from(`receiptissue${fySuffix()}`)
      .delete()
      .eq('Collect_id', matchedCol.collect_id)
      .eq('sno', sno)
      .select();
    if (error) throw new Error(`Could not delete receipt book: ${error.message}`);
    if (!data?.length) return NextResponse.json({ success: false, error: 'That receipt book was not found.' }, { status: 404 });

    const reindexed = await loadAllotments(collectors);

    const collectorRemaining = reindexed.filter(a => 
      a.collector_name.toLowerCase() === cleanName.toLowerCase()
    );

    return NextResponse.json({
      success: true,
      message: 'Allotment deleted successfully from receiptissue20262027!',
      allotments: collectorRemaining,
      all_allotments: reindexed
    });
  } catch (error: any) {
    console.error('Error deleting receipt allotment:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
