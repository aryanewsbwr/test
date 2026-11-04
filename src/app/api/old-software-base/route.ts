import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The old software's last complete backup, kept gzipped in pieces in a private bucket, so a complete
// backup for the old software can be made with one click. The pieces go to and from storage
// directly; this route only hands out short-lived links and records which copy is current.
const BUCKET = 'old-software-base';
const META = 'current.json';

async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
  if (error && !/exists/i.test(error.message)) throw new Error(error.message);
}

async function readMeta(): Promise<any | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(META);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

// GET: which copy is kept; with ?links=1 also a download link for each piece
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  await ensureBucket();
  const meta = await readMeta();
  if (!meta) return NextResponse.json({ missing: true });
  if (new URL(req.url).searchParams.get('links') !== '1') return NextResponse.json(meta);
  const links: string[] = [];
  for (const path of meta.parts) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data) return NextResponse.json({ error: `Piece ${path} not found` }, { status: 500 });
    links.push(data.signedUrl);
  }
  return NextResponse.json({ ...meta, links });
}

// POST { action: 'part', folder, index } -> an upload link for one piece
// POST { action: 'finish', folder, parts, name, size } -> makes that copy the current one
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  const body = await req.json().catch(() => ({}));
  const folder = String(body.folder || '');
  if (!/^v\d{13}$/.test(folder)) return NextResponse.json({ error: 'folder is required' }, { status: 400 });
  await ensureBucket();

  if (body.action === 'part') {
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index > 99) return NextResponse.json({ error: 'index is required' }, { status: 400 });
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(`${folder}/part-${index}.gz`);
    if (error || !data) return NextResponse.json({ error: error?.message || 'No upload link' }, { status: 500 });
    return NextResponse.json({ url: data.signedUrl });
  }

  if (body.action === 'finish') {
    const count = Number(body.parts);
    const { data: listed, error: listError } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit: 200 });
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    const parts = Array.from({ length: count }, (_, i) => `${folder}/part-${i}.gz`);
    const have = new Set((listed || []).map(f => `${folder}/${f.name}`));
    if (!count || parts.some(p => !have.has(p))) return NextResponse.json({ error: 'Not every piece arrived; nothing was changed' }, { status: 400 });

    const old = await readMeta();
    const meta = { name: String(body.name || ''), size: Number(body.size) || 0, saved_at: new Date().toISOString(), parts };
    const { error } = await supabaseAdmin.storage.from(BUCKET)
      .upload(META, new Blob([JSON.stringify(meta)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The previous copy is no longer needed
    if (old?.parts?.length) await supabaseAdmin.storage.from(BUCKET).remove(old.parts.filter((p: string) => !p.startsWith(folder)));
    return NextResponse.json(meta);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
