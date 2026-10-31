import { NextRequest, NextResponse } from 'next/server';
import { fySuffix } from '@/lib/financialYear';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const STORAGE_BUCKET = 'news-images';
const storageFile = () => `data/receipt_allotments_${fySuffix()}.json`;

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

async function loadAllotmentsFromStorage(): Promise<ReceiptAllotmentRecord[]> {
  // 1. Try public/data/receipt_allotments_20262027.json
  const pubPath = path.join(process.cwd(), 'public', 'data', `receipt_allotments_${fySuffix()}.json`);
  if (fs.existsSync(pubPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pubPath, 'utf-8'));
      if (Array.isArray(data)) return data;
    } catch {}
  }

  // 2. Try Supabase Storage
  try {
    const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(storageFile());
    if (!error && data) {
      const text = await data.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Supabase storage download error for receipt allotments 20262027:', err);
  }

  return [];
}

async function saveAllotmentsToStorage(data: ReceiptAllotmentRecord[]) {
  // 1. Save to public/data/receipt_allotments_20262027.json
  try {
    const pubDir = path.join(process.cwd(), 'public', 'data');
    if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
    const pubPath = path.join(pubDir, `receipt_allotments_${fySuffix()}.json`);
    fs.writeFileSync(pubPath, JSON.stringify(data, null, 2), 'utf-8');
    
    // Also update legacy receipt_allotments.json to keep it aligned
    const legacyPath = path.join(pubDir, 'receipt_allotments.json');
    fs.writeFileSync(legacyPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}

  // 2. Save to Supabase Storage
  try {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(
      storageFile(),
      Buffer.from(JSON.stringify(data, null, 2)),
      { upsert: true, contentType: 'application/json' }
    );
  } catch (err) {
    console.warn('Supabase storage upload error for receipt allotments 20262027:', err);
  }
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

    // 1. Fetch collectors
    const collectorsRes = await supabaseAdmin
      .from('collect')
      .select('*')
      .order('name', { ascending: true });

    const collectors = (collectorsRes.data || []).map((c: any) => ({
      collect_id: c.Collect_id || c.collect_id || c.id,
      name: c.name || c.collector_name || `Collector #${c.Collect_id}`
    })).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    const colMap = Object.fromEntries(collectors.map(c => [c.collect_id, c.name]));

    // 2. Query Supabase table receiptissue20262027 (strictly active FY 2026-2027)
    let dbRecords: ReceiptAllotmentRecord[] = [];
    try {
      const { data: dbIssues, error: dbErr } = await supabaseAdmin
        .from(`receiptissue${fySuffix()}`)
        .select('*')
        .order('sno', { ascending: true });

      if (!dbErr && dbIssues && Array.isArray(dbIssues) && dbIssues.length > 0) {
        dbRecords = dbIssues.map(item => {
          const cName = colMap[item.Collect_id] || ('Collector ' + item.Collect_id);
          return {
            sno: Number(item.sno) || 1,
            collect_id: item.Collect_id,
            collector_name: cName,
            receipt_from: Number(item.ReceiptFrom) || 0,
            receipt_to: Number(item.ReceiptTo) || 0,
            allot_date: formatDateToDDMMYYYY(item.IssueDate),
            rec_date: item.RecDate ? formatDateToDDMMYYYY(item.RecDate) : null
          };
        });
      }
    } catch (e) {
      console.warn('Could not query receiptissue20262027 from Supabase:', e);
    }

    // 3. Fallback to 2026-2027 dedicated storage if table not yet populated or created
    const storageRecords = await loadAllotmentsFromStorage();
    const activeRecords = dbRecords.length > 0 ? dbRecords : storageRecords;
    const allotments = sortAndIndexAllotments(activeRecords);

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
    const { data: cols } = await supabaseAdmin.from('collect').select('*');
    const cleanName = collector_name.trim();
    const matchedCol = (cols || []).find((c: any) => (c.name || '').toLowerCase() === cleanName.toLowerCase());
    const collectId = matchedCol ? (matchedCol.Collect_id || matchedCol.collect_id || matchedCol.id) : null;

    // Load existing allotments for validation (strictly FY 2026-2027)
    let allotments = await loadAllotmentsFromStorage();

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

    // Save to Supabase receiptissue20262027 table (if table exists)
    try {
      if (edit_sno && collectId) {
        await supabaseAdmin
          .from(`receiptissue${fySuffix()}`)
          .update({
            ReceiptFrom: String(fromNum),
            ReceiptTo: String(toNum),
            IssueDate: dbIssueDate,
            RecDate: formattedRecDate ? formatDateToYYYYMMDD(formattedRecDate) : null
          })
          .eq('Collect_id', collectId)
          .eq('sno', edit_sno);
      } else if (collectId) {
        const collectorItems = allotments.filter(a => a.collector_name.toLowerCase() === cleanName.toLowerCase());
        const nextSno = collectorItems.length > 0 ? Math.max(...collectorItems.map(a => a.sno)) + 1 : 1;

        await supabaseAdmin
          .from(`receiptissue${fySuffix()}`)
          .insert({
            sno: nextSno,
            Collect_id: collectId,
            ReceiptFrom: String(fromNum),
            ReceiptTo: String(toNum),
            IssueDate: dbIssueDate,
            RecDate: formattedRecDate ? formatDateToYYYYMMDD(formattedRecDate) : null
          });
      }
    } catch (dbErr) {
      console.warn('Database write to receiptissue20262027:', dbErr);
    }

    // Update in storage file for 2026-2027
    let updatedAllotments = [...allotments];
    if (edit_sno) {
      const idx = updatedAllotments.findIndex(a => 
        a.collector_name.toLowerCase() === cleanName.toLowerCase() && a.sno === edit_sno
      );
      if (idx !== -1) {
        updatedAllotments[idx] = {
          ...updatedAllotments[idx],
          collector_name: cleanName,
          receipt_from: fromNum,
          receipt_to: toNum,
          allot_date: formattedAllotDate,
          rec_date: formattedRecDate,
          updated_at: new Date().toISOString()
        };
      }
    } else {
      const collectorItems = allotments.filter(a => a.collector_name.toLowerCase() === cleanName.toLowerCase());
      const nextSno = collectorItems.length > 0 ? Math.max(...collectorItems.map(a => a.sno)) + 1 : 1;

      const newRecord: ReceiptAllotmentRecord = {
        sno: nextSno,
        collect_id: collectId,
        collector_name: cleanName,
        receipt_from: fromNum,
        receipt_to: toNum,
        allot_date: formattedAllotDate,
        rec_date: formattedRecDate,
        created_at: new Date().toISOString()
      };
      updatedAllotments.push(newRecord);
    }

    const sortedAll = sortAndIndexAllotments(updatedAllotments);
    await saveAllotmentsToStorage(sortedAll);

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

    // Delete from Supabase receiptissue20262027 table
    try {
      const { data: cols } = await supabaseAdmin.from('collect').select('*');
      const matchedCol = (cols || []).find((c: any) => (c.name || '').toLowerCase() === cleanName.toLowerCase());
      if (matchedCol) {
        const collectId = matchedCol.Collect_id || matchedCol.collect_id || matchedCol.id;
        await supabaseAdmin
          .from(`receiptissue${fySuffix()}`)
          .delete()
          .eq('Collect_id', collectId)
          .eq('sno', sno);
      }
    } catch (dbErr) {
      console.warn('Database delete error on receiptissue20262027:', dbErr);
    }

    const allotments = await loadAllotmentsFromStorage();
    const filtered = allotments.filter(a => 
      !(a.collector_name.toLowerCase() === cleanName.toLowerCase() && a.sno === sno)
    );

    const reindexed = sortAndIndexAllotments(filtered);
    await saveAllotmentsToStorage(reindexed);

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
