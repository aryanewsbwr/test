import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';

import { cleanOrTransliterateHindi } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';

let cachedCustomers: any[] | null = null;

function loadLocalBackup(): any[] {
  if (cachedCustomers) return cachedCustomers;
  const filePath = path.join(process.cwd(), 'public', 'data', 'all_customers.json');
  if (fs.existsSync(filePath)) {
    cachedCustomers = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return cachedCustomers || [];
  }
  return [];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const regionId = searchParams.get('region_id');
    const order = (searchParams.get('order') || (search ? 'asc' : 'desc')).toLowerCase();
    const isAscending = order === 'asc';

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // 1. Try Live Supabase Query
    let query = supabase
      .from('customer')
      .select('*', { count: 'exact' });

    if (search) {
      if (/^\d+$/.test(search)) {
        query = query.or(`customer_id.eq.${search},priority.eq.${search},phone.ilike.%${search}%`);
      } else {
        query = query.or(`name_eng.ilike.%${search}%,name_hindi.ilike.%${search}%`);
      }
    }

    if (regionId && regionId !== 'all') {
      query = query.eq('region_id', parseInt(regionId, 10));
    }

    query = query.order('customer_id', { ascending: isAscending }).range(from, to);

    const { data, count, error } = await query;

    if (!error && data && data.length > 0 && (count ?? 0) > 0) {
      const decodedCustomers = (data || []).map(c => ({
        ...c,
        name_hindi: cleanOrTransliterateHindi(c.name_hindi, c.name_eng),
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
    }

    // 2. Fallback to Local Dataset if Supabase has network/config error or empty table
    const all = loadLocalBackup();
    let filtered = all;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(c => 
        c.name_eng?.toLowerCase().includes(s) ||
        c.name_hindi?.includes(s) ||
        c.customer_id?.toString() === s ||
        c.priority?.toString() === s ||
        c.phone?.includes(s)
      );
    }

    if (regionId && regionId !== 'all') {
      filtered = filtered.filter(c => c.region_id === parseInt(regionId, 10));
    }

    const total = filtered.length;
    const localData = filtered.slice(from, from + limit);
    const decodedLocal = localData.map(c => ({
      ...c,
      name_hindi: cleanOrTransliterateHindi(c.name_hindi, c.name_eng),
      hindi_add: cleanOrTransliterateHindi(c.hindi_add, c.add1 || '')
    }));

    return NextResponse.json({
      source: 'local_backup',
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      customers: decodedLocal
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

    const custFilePath = path.join(process.cwd(), 'public', 'data', 'all_customers.json');
    let localCusts: any[] = [];
    if (fs.existsSync(custFilePath)) {
      localCusts = JSON.parse(fs.readFileSync(custFilePath, 'utf-8'));
    }

    let finalId = customer_id ? parseInt(customer_id, 10) : 0;
    const isUpdate = finalId > 0 && localCusts.some(c => c.customer_id === finalId);

    if (!isUpdate) {
      let maxSb = 0;
      try {
        const { data: maxRow } = await supabase
          .from('customer')
          .select('customer_id')
          .order('customer_id', { ascending: false })
          .limit(1);
        if (maxRow && maxRow.length > 0 && maxRow[0].customer_id) {
          maxSb = Number(maxRow[0].customer_id);
        }
      } catch (_) {}
      const maxLocal = localCusts.reduce((max, c) => Math.max(max, c.customer_id || 0), 0);
      finalId = Math.max(maxLocal, maxSb) + 1;
    }

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

    // 1. Save to Supabase matching exact schema
    try {
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
      if (isUpdate) {
        const { error: sbErr } = await supabase.from('customer').update(supabaseCustomerRecord).eq('customer_id', finalId);
        if (sbErr) console.error('Supabase customer update error:', sbErr);
      } else {
        const { error: sbErr } = await supabase.from('customer').insert([supabaseCustomerRecord]);
        if (sbErr) console.error('Supabase customer insert error:', sbErr);
      }
    } catch (dbErr) {
      console.warn('Supabase customer save warning:', dbErr);
    }

    // 2. Update local all_customers.json
    try {
      if (isUpdate) {
        localCusts = localCusts.map(c => c.customer_id === finalId ? { ...c, ...record } : c);
      } else {
        localCusts.unshift(record);
      }
      fs.writeFileSync(custFilePath, JSON.stringify(localCusts, null, 2), 'utf-8');
      cachedCustomers = localCusts;
    } catch (fsErr) {}

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

    // 1. Delete from Supabase
    try {
      await supabase.from('customer').delete().eq('customer_id', cid);
      await supabase.from('customer_detail').delete().eq('customer_id', cid);
    } catch (dbErr) {
      console.warn('Supabase customer delete warning:', dbErr);
    }

    // 2. Delete from local all_customers.json
    try {
      const custFilePath = path.join(process.cwd(), 'public', 'data', 'all_customers.json');
      if (fs.existsSync(custFilePath)) {
        let localCusts = JSON.parse(fs.readFileSync(custFilePath, 'utf-8'));
        localCusts = localCusts.filter((c: any) => c.customer_id !== cid);
        fs.writeFileSync(custFilePath, JSON.stringify(localCusts, null, 2), 'utf-8');
        cachedCustomers = localCusts;
      }
    } catch (fsErr) {}

    return NextResponse.json({
      success: true,
      message: `Customer #${cid} deleted successfully from database.`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
