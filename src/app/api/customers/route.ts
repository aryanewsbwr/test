import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { cleanOrTransliterateHindi, storedHindiName } from '@/lib/transliteration';
import { nextId } from '@/lib/publicationsData';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const regionId = searchParams.get('region_id');
    const order = (searchParams.get('order') || (search ? 'asc' : 'desc')).toLowerCase();
    const isAscending = order === 'asc';

    // Every customer, for screens that search the whole list as you type. The database
    // returns 1,000 rows per request, so this reads page by page.
    if (searchParams.get('all') === 'true') {
      const rows: any[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await supabase
          .from('customer')
          .select('*')
          .order('customer_id', { ascending: true })
          .range(start, start + 999);
        if (error) throw new Error(`Could not read customers: ${error.message}`);
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const customers = rows.map(c => {
        const { customer_id, name_eng, add1, add2, hindi_add, phone, priority, region_id, cbal, dueamount, due_amount, govt_supply } = c;
        return {
          customer_id, name_eng, add1, add2, hindi_add, phone, priority, region_id, cbal, dueamount, due_amount, govt_supply,
          name_hindi: cleanOrTransliterateHindi(storedHindiName(c), name_eng)
        };
      });
      return NextResponse.json({ source: 'supabase', total: customers.length, customers });
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // 1. Try Live Supabase Query
    let query = supabase
      .from('customer')
      .select('*', { count: 'exact' });

    if (search) {
      if (/^\d+$/.test(search)) {
        query = query.or(`customer_id.eq.${search},priority.eq.${search},name_eng.ilike.%${search}%,phone.ilike.%${search}%`);
      } else {
        query = query.or(`name_eng.ilike.%${search}%,name_hindi.ilike.%${search}%`);
      }
    }

    if (regionId && regionId !== 'all') {
      query = query.eq('region_id', parseInt(regionId, 10));
    }

    query = query.order('customer_id', { ascending: isAscending }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw new Error(`Could not read customers: ${error.message}`);

    const decodedCustomers = (data || []).map(c => ({
      ...c,
      name_hindi: cleanOrTransliterateHindi(storedHindiName(c), c.name_eng),
      hindi_add: cleanOrTransliterateHindi(c.hindi_add, c.add1 || '')
    }));

    return NextResponse.json({
      source: 'supabase',
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      customers: decodedCustomers
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Save / Update Customer in Supabase and Local Cache
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, name_eng, name_hindi, add1, hindi_add, phone, region_id = 1, security_deposit = 0, dueamount = 0, priority = 1, ...rest } = body;

    if (!name_eng || !name_eng.trim()) {
      return NextResponse.json({ error: 'Customer English Name is required' }, { status: 400 });
    }

    const hindi = cleanOrTransliterateHindi(name_hindi, name_eng);
    const hindiAddress = cleanOrTransliterateHindi(hindi_add, add1 || '');

    // An existing customer is updated in place. Checking the database, not a copy, keeps an
    // edit from turning into a second customer with the same name.
    let finalId = customer_id ? parseInt(customer_id, 10) : 0;
    let oldPhone = '';
    if (finalId > 0) {
      const { data: found, error: findErr } = await supabase.from('customer').select('customer_id, phone').eq('customer_id', finalId);
      if (findErr) throw new Error(`Could not read customers: ${findErr.message}`);
      if (!found?.length) finalId = 0;
      else oldPhone = String(found[0].phone || '').trim();
    }
    const isUpdate = finalId > 0;
    if (!isUpdate) finalId = await nextId('customer', 'customer_id');

    const cleanSecDep = isNaN(Number(security_deposit)) ? 0 : Number(security_deposit);

    const record = {
      customer_id: finalId,
      name_eng: name_eng.trim(),
      name_hindi: hindi,
      add1: add1 || '',
      hindi_add: hindiAddress,
      phone: phone || '',
      region_id: parseInt(region_id, 10) || 1,
      security_deposit: cleanSecDep,
      dueamount: Number(dueamount || 0),
      priority: Number(priority || 1),
      cbal: Number(dueamount || 0),
      ...rest
    };

    const supabaseCustomerRecord = {
      customer_id: finalId,
      name_eng: name_eng.trim(),
      name_hindi: hindi,
      add1: add1 || '',
      hindi_add: hindiAddress,
      phone: phone || '',
      priority: Number(priority || 1),
      region_id: parseInt(region_id, 10) || 1,
      security_deposit: cleanSecDep,
      due_amount: Number(dueamount || 0)
    };
    const { error: sbErr } = isUpdate
      ? await supabase.from('customer').update(supabaseCustomerRecord).eq('customer_id', finalId)
      : await supabase.from('customer').insert([supabaseCustomerRecord]);
    if (sbErr) throw new Error(`Could not save customer: ${sbErr.message}`);

    // The corrected column is what bills print, so an edit must reach it. Separate from the save
    // above, so a database without this column yet still saves the customer.
    const { error: hindiErr } = await supabase.from('customer').update({ name_hindi_unicode: hindi }).eq('customer_id', finalId);
    if (hindiErr) console.warn('Corrected Hindi name not saved:', hindiErr.message);

    // A number changed here belongs in Numbers > History too. The customer is already saved,
    // so a failure here (History not set up yet) must not report the save as failed.
    if (isUpdate && oldPhone !== String(phone || '').trim()) {
      const user = await currentUser(request);
      const { error: historyErr } = await supabase.from('customer_phone_history').insert([{
        customer_id: finalId,
        customer_name: supabaseCustomerRecord.name_eng,
        region_id: supabaseCustomerRecord.region_id,
        old_phone: oldPhone,
        new_phone: String(phone || '').trim(),
        changed_by: user?.username || user?.id || ''
      }]);
      if (historyErr) console.warn('Number change not added to history:', historyErr.message);
    }

    return NextResponse.json({
      success: true,
      message: `Customer #${finalId} (${name_eng}) ${isUpdate ? 'updated' : 'created'} successfully!`,
      customer: record
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idStr = searchParams.get('customer_id') || searchParams.get('id');
    if (!idStr) return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });

    const cid = parseInt(idStr, 10);

    // Subscriptions first, so a failure never leaves subscriptions with no customer
    const { error: subErr } = await supabase.from('customer_detail').delete().eq('customer_id', cid);
    if (subErr) throw new Error(`Could not delete subscriptions: ${subErr.message}`);
    const { data: gone, error: delErr } = await supabase.from('customer').delete().eq('customer_id', cid).select('customer_id');
    if (delErr) throw new Error(`Could not delete customer: ${delErr.message}`);
    if (!gone?.length) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: `Customer #${cid} deleted successfully from database.`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
