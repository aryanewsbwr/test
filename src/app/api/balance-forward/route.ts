import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { closingYears } from '@/lib/financialYear';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const label = (fy: string) => `${fy.slice(0, 4)}-${fy.slice(4)}`;

function plainError(error: any, years: { from_fy: string; to_fy: string }) {
  const text = String(error?.message || error);
  if (text.includes('NO_MARCH_BILLS')) return `${label(years.from_fy)} के मार्च के बिल अभी नहीं बने हैं। पहले मार्च के बिल बनाएं, फिर बैलेंस फॉरवर्ड करें।`;
  if (text.includes('ALREADY_OPEN')) return `${label(years.to_fy)} का बैलेंस फॉरवर्ड पहले ही हो चुका है। दोबारा करने की ज़रूरत नहीं है।`;
  if (error?.code === 'PGRST202') return 'बैलेंस फॉरवर्ड अभी चालू नहीं है: supabase/year_end_rollover.sql एक बार SQL Editor में चलाना बाकी है।';
  return `बैलेंस फॉरवर्ड नहीं हुआ: ${text}`;
}

async function rollover(preview: boolean) {
  const years = closingYears();
  const { data, error } = await supabaseAdmin.rpc('year_end_rollover', { ...years, preview });
  if (error) return NextResponse.json({ error: plainError(error, years) }, { status: 400 });
  return NextResponse.json({ ...data, from_label: label(years.from_fy), to_label: label(years.to_fy) });
}

// GET shows what would be carried, POST does it
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  return refused || rollover(true);
}

export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  return refused || rollover(false);
}
