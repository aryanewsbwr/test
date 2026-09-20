import { NextRequest, NextResponse } from 'next/server';
import { englishToHindiPhonetic } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const text = request.nextUrl.searchParams.get('text') || '';
  return handleTransliterate(text);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = body.text || '';
    return handleTransliterate(text);
  } catch {
    return NextResponse.json({ success: false, text: '' }, { status: 400 });
  }
}

async function handleTransliterate(text: string) {
  if (!text || !text.trim()) {
    return NextResponse.json({ success: true, text: '' });
  }

  const cleanText = text.trim();

  // 1. Try Google Input Tools API with a 1.5s timeout for authentic Indian transliteration
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(cleanText)}&itc=hi-t-i0-und&num=1`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0] === 'SUCCESS' && data[1]?.[0]?.[1]?.[0]) {
        return NextResponse.json({
          success: true,
          text: data[1][0][1][0],
          source: 'google'
        });
      }
    }
  } catch {
    // Network offline or timeout -> proceed to offline fallback
  }

  // 2. High-Accuracy Offline Fallback
  const fallback = englishToHindiPhonetic(cleanText);
  return NextResponse.json({
    success: true,
    text: fallback,
    source: 'offline'
  });
}
