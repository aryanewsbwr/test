import { NextRequest, NextResponse } from 'next/server';
import { refuseWithout } from '@/lib/auth';
import { forgetCompany } from '@/lib/companyServer';
import { listMessages, addMessage, deleteMessage } from '@/lib/messageTable';

export const dynamic = 'force-dynamic';

// Master > Message: the bill messages, kept in the old software's message table.
// The newest one prints at the bottom of every bill.

// GET -> { messages: [{ message_id, dated, message }] } newest first
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  try {
    return NextResponse.json({ messages: await listMessages() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not read messages' }, { status: 500 });
  }
}

// POST { dated, message }
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const b = await req.json().catch(() => ({}));
  const text = String(b.message ?? '').trim().slice(0, 300);
  const dated = String(b.dated ?? '').trim().slice(0, 10);
  if (!text) return NextResponse.json({ error: 'संदेश लिखें' }, { status: 400 });
  try {
    await addMessage(dated, text);
    forgetCompany();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not save' }, { status: 500 });
  }
}

// DELETE ?id=3  (or ?text=... for a message without a number)
export async function DELETE(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const p = req.nextUrl.searchParams;
  const id = Number(p.get('id')) || null;
  const text = String(p.get('text') || '').trim();
  if (!id && !text) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    await deleteMessage(id, text);
    forgetCompany();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not delete' }, { status: 500 });
  }
}
