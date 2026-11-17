import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { fetchPublications } from '@/lib/publicationsData';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { mobileCaller } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

// Every paper that can still be started, Hindi papers by their Hindi name, in English
// alphabetical order (English and Hindi editions together), with the English name to search by
export async function GET(req: NextRequest) {
  const caller = await mobileCaller(req);
  if (caller instanceof NextResponse) return caller;
  try {
    const [pubs, { data: stopped }] = await Promise.all([fetchPublications(), db.from('publicationdis').select('*')]);
    const today = new Date().toISOString().slice(0, 10);
    const closed = new Set((stopped || [])
      .filter((d: any) => String(d.dis_type || d.Dis_Type || '').toUpperCase().startsWith('P'))
      .filter((d: any) => { const to = String(d.to_date || d.ToDate || '').slice(0, 10); return !to || to >= today; })
      .map((d: any) => Number(d.publica_id || d.Publica_id)));
    const sortName = (p: any) => String(p.public_name || '').replace(/\s*\((e|h|eng|english|hin|hindi)\)\s*$/i, '').trim();
    const papers = pubs
      .filter((p: any) => !closed.has(Number(p.publica_id)) && String(p.public_name || '').trim())
      .sort((a: any, b: any) => sortName(a).localeCompare(sortName(b), 'en', { sensitivity: 'base' }) || (a.pub_hindi ? 1 : 0) - (b.pub_hindi ? 1 : 0))
      .map((p: any) => {
        const english = String(p.public_name).trim();
        return { publica_id: Number(p.publica_id), name: p.pub_hindi ? cleanOrTransliterateHindi(p.pub_hindi, english) : english, english };
      });
    return NextResponse.json({ papers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not read papers' }, { status: 500 });
  }
}
