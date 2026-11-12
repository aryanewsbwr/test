import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppBillMessage, formatWhatsAppPhone, getSecureWhatsAppToken, whatsAppDisplayName } from '@/lib/whatsappService';
import { getThermalPublicationDisplayName } from '@/lib/billThermalExport';
import { billRoundOff, formatRoundOff } from '@/lib/billingEngine';
import { storedHindiName } from '@/lib/transliteration';
import { generateDynamicUpiQrSvg } from '@/lib/upiQrHelper';
import { MANGAL_FONT_BASE64 } from '@/assets/fonts/mangalBase64';
import { svgToPng } from '@/lib/svgToPng';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getEmbeddedMangalBase64(): string {
  return MANGAL_FONT_BASE64;
}

// This month's bill after delivery and discount, the same figure the printed bill shows
function billCurrentAmount(bill: any): number {
  return Number(bill.current_bill ?? bill.paper_amount ?? bill.month_amount ?? 0);
}

// The approved template has no Paid or Round Off line, so its text shows whatever is left of
// the Total after this month's bill. That keeps Current + Previous equal to Total; the bill
// image still lists Paid and Round Off separately.
function textPreviousDue(bill: any): number {
  return Math.round((Number(bill.net_payable || 0) - billCurrentAmount(bill)) * 100) / 100;
}

function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Records a send attempt. The table allows one successful row per bill, so a
 * resend updates that row to the latest send instead of failing to log.
 */
async function logWhatsAppMessage(row: Record<string, any>) {
  const { error } = await supabaseAdmin.from('whatsapp_messages').insert(row);
  if (!error) return;
  if (error.code !== '23505') {
    console.warn('[WhatsApp Route] Error logging to database:', error);
    return;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('whatsapp_messages')
    .update({ ...row, created_at: now, updated_at: now })
    .eq('bill_id', row.bill_id)
    .in('status', ['sent', 'delivered', 'read']);
  if (updateError) console.warn('[WhatsApp Route] Error updating resend log:', updateError);
}

/**
 * Creates a standalone high-contrast SVG of the exact 48mm thermal bill slip
 * and rasterizes it to a clean PNG buffer using sharp.
 */
async function generateBillPngBuffer(bill: any): Promise<Buffer> {
  const rawEngName = (bill.customer_name || bill.name_eng || '').trim();
  const engName = rawEngName.replace(/\s+crd\b/i, '').trim();
  const billNo = bill.bill_no || bill.customer_id || '37210';
  const month = bill.month || 'Oct 2026';
  const acNo = bill.customer_id || '24669';
  const region = bill.region_name || bill.region_id || 'WhatsApp';
  const phone = bill.phone || '';
  
  const currentAmt = billCurrentAmount(bill).toFixed(2);
  const paidAmt = Number(bill.paid_amount || 0);
  const prevDue = Number(bill.previous_due !== undefined ? bill.previous_due : 0).toFixed(2);
  const deliveryChg = Number(bill.delivery_charge || 0);
  const totalAmt = Number(bill.net_payable !== undefined ? bill.net_payable : (Number(currentAmt) + Number(prevDue) + deliveryChg)).toFixed(2);
  const roundOff = billRoundOff(Number(totalAmt), Number(currentAmt) + Number(prevDue) - paidAmt);

  const fontB64 = getEmbeddedMangalBase64();
  const fontFaceCss = fontB64 ? `
    @font-face {
      font-family: 'MangalEmbedded';
      src: url('data:font/truetype;charset=utf-8;base64,${fontB64}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
  ` : '';

  const fontStack = fontB64 
    ? `'MangalEmbedded', Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
    : `Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

  // One line per paper with its amount; the delivery charge is folded into the papers'
  // amounts (as on the simple printed bill), so the customer sees only papers and the total.
  const items = Array.isArray(bill.items) ? bill.items : [];
  const hasItemDelivery = items.some((it: any) => Number(it.delivery_amount || 0) > 0);
  const byPaper = new Map<string, { name: string; amount: number }>();
  items.forEach((it: any, idx: number) => {
    const name = String(it.pub_name || it.name || 'Newspaper').trim();
    const delivery = hasItemDelivery ? Number(it.delivery_amount || 0) : (idx === 0 ? deliveryChg : 0);
    const amount = Number(it.net_amount ?? it.amount ?? 0) + delivery;
    const entry = byPaper.get(name.toLowerCase());
    if (entry) entry.amount += amount; else byPaper.set(name.toLowerCase(), { name, amount });
  });
  if (byPaper.size === 0) byPaper.set('paper', { name: 'Newspaper', amount: Number(currentAmt) + deliveryChg });
  const papers = Array.from(byPaper.values()).map(p => ({ ...p, amount: Math.round(p.amount * 100) / 100 }));
  const papersTotal = Math.round(papers.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  // Whatever is left of the total is last month's balance (after payments): shown as one line so
  // the lines add up to the total. Negative means an advance.
  const earlier = Math.round((Number(totalAmt) - papersTotal) * 100) / 100;

  let itemRowsSvg = '';
  let curY = 316;
  papers.forEach(p => {
    itemRowsSvg += `
      <text x="16" y="${curY}" font-size="13" class="t-reg" fill="#000000">${escapeXml(p.name)}</text>
      <text x="384" y="${curY}" font-size="13" class="t-bold" fill="#000000" text-anchor="end">${p.amount.toFixed(2)}</text>
      `;
    curY += 24;
  });

  // Dynamic layout coordinates based on line item count
  const dividerY = curY + 6;
  const earlierY = dividerY + 24;
  const totalBoxY = (Math.abs(earlier) >= 0.01 ? earlierY : dividerY) + 16;
  const qrY = totalBoxY + 52;
  const qrText1Y = qrY + 164;
  const qrText2Y = qrText1Y + 18;
  const footerDividerY = qrText2Y + 20;
  const footerNotice1Y = footerDividerY + 20;
  const footerNotice2Y = footerNotice1Y + 18;
  const footerNotice3Y = footerNotice2Y + 18;
  const footerThankYouY = footerNotice3Y + 22;
  const totalSvgHeight = footerThankYouY + 58;

  // Real Dynamic UPI QR Code
  const upiQrSvgRaw = generateDynamicUpiQrSvg(Number(totalAmt), billNo, month, 140, 0);
  // The code is drawn in its own small units (one per square), so it is scaled up to fill the box
  const qrUnits = Number(upiQrSvgRaw.match(/viewBox="0 0 (\d+(?:\.\d+)?)/)?.[1]) || 140;
  const upiQrSvgInner = upiQrSvgRaw
    ? `<g transform="scale(${140 / qrUnits})">${upiQrSvgRaw.trim().replace(/^<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '')}</g>`
    : '';

  // High-resolution thermal bill slip SVG layout
  const svg = `
  <svg width="400" height="${totalSvgHeight}" viewBox="0 0 400 ${totalSvgHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        ${fontFaceCss}
        .t-bold { font-family: ${fontStack}; font-weight: 800; }
        .t-mid { font-family: ${fontStack}; font-weight: 600; }
        .t-reg { font-family: ${fontStack}; font-weight: normal; }
        .t-num { font-family: 'Courier New', Courier, monospace; font-weight: 700; }
      </style>
    </defs>
    
    <!-- Background Card -->
    <rect width="400" height="${totalSvgHeight}" fill="#ffffff"/>
    
    <!-- Festive Diwali Greeting Banner -->
    <g id="diwali-banner">
      <rect x="24" y="8" width="352" height="26" rx="4" fill="#FFFBEB" stroke="#F59E0B" stroke-width="1"/>
      
      <!-- Left Deepak (Diya) -->
      <g transform="translate(56, 12)">
        <path d="M10 1C10 1 6.5 5.5 7.5 8.5C8.2 10.7 10 11.2 10 11.2C10 11.2 11.8 10.7 12.5 8.5C13.5 5.5 10 1 10 1Z" fill="#F59E0B"/>
        <path d="M10 4C10 4 8.2 6.5 8.8 8.2C9.2 9.5 10 9.8 10 9.8C10 9.8 10.8 9.5 11.2 8.2C11.8 6.5 10 4 10 4Z" fill="#EF4444"/>
        <path d="M2 10C3 14.5 6.5 16.5 10 16.5C13.5 16.5 17 14.5 18 10C18 10 14 12 10 12C6 12 2 10 2 10Z" fill="#B45309"/>
        <path d="M1.5 10C1.5 10 5.5 11.5 10 11.5C14.5 11.5 18.5 10 18.5 10C18.5 10 14.5 11 10 11C5.5 11 1.5 10 1.5 10Z" fill="#D97706"/>
      </g>
      
      <!-- Greeting Text -->
      <text x="200" y="26" font-size="13" class="t-bold" fill="#92400E" text-anchor="middle" letter-spacing="1">HAPPY DIWALI</text>
      
      <!-- Right Deepak (Diya) -->
      <g transform="translate(324, 12)">
        <path d="M10 1C10 1 6.5 5.5 7.5 8.5C8.2 10.7 10 11.2 10 11.2C10 11.2 11.8 10.7 12.5 8.5C13.5 5.5 10 1 10 1Z" fill="#F59E0B"/>
        <path d="M10 4C10 4 8.2 6.5 8.8 8.2C9.2 9.5 10 9.8 10 9.8C10 9.8 10.8 9.5 11.2 8.2C11.8 6.5 10 4 10 4Z" fill="#EF4444"/>
        <path d="M2 10C3 14.5 6.5 16.5 10 16.5C13.5 16.5 17 14.5 18 10C18 10 14 12 10 12C6 12 2 10 2 10Z" fill="#B45309"/>
        <path d="M1.5 10C1.5 10 5.5 11.5 10 11.5C14.5 11.5 18.5 10 18.5 10C18.5 10 14.5 11 10 11C5.5 11 1.5 10 1.5 10Z" fill="#D97706"/>
      </g>
    </g>

    <g transform="translate(0, 36)">
    <!-- Header -->
    <text x="200" y="32" font-size="19" class="t-bold" fill="#000000" text-anchor="middle" letter-spacing="0.5">ARYAN NEWS AGENCY</text>
    <text x="200" y="56" font-size="12" class="t-mid" fill="#000000" text-anchor="middle">5(1), Old Bus Stand, Beawar (Raj.) 305901</text>
    <text x="200" y="76" font-size="12" class="t-reg" fill="#000000" text-anchor="middle">WhatsApp: 9462558949 | Ph: 9829058949</text>
    <text x="200" y="96" font-size="11" class="t-reg" fill="#000000" text-anchor="middle">www.aryannewsagency.com</text>
    
    <!-- Thick Rule -->
    <line x1="16" y1="108" x2="384" y2="108" stroke="#000000" stroke-width="2.5"/>
    
    <!-- Meta Info -->
    <text x="16" y="130" font-size="14" class="t-bold" fill="#000000">Bill No: ${escapeXml(billNo)}</text>
    <text x="384" y="130" font-size="14" class="t-bold" fill="#000000" text-anchor="end">Month: ${escapeXml(month)}</text>
    <text x="16" y="152" font-size="14" class="t-bold" fill="#000000">A/c No: ${escapeXml(acNo)}</text>
    
    <!-- Dashed Divider -->
    <line x1="16" y1="166" x2="384" y2="166" stroke="#000000" stroke-width="1.2" stroke-dasharray="5,3"/>
    
    <!-- Customer Details -->
    <text x="16" y="194" font-size="15" class="t-bold" fill="#000000">${escapeXml(engName.toUpperCase())}</text>
    <text x="16" y="220" font-size="12" class="t-reg" fill="#000000">Region: ${escapeXml(region)}</text>
    <text x="384" y="220" font-size="12" class="t-reg" fill="#000000" text-anchor="end">Mob: ${escapeXml(phone)}</text>
    
    <!-- Dashed Divider -->
    <line x1="16" y1="242" x2="384" y2="242" stroke="#000000" stroke-width="1.2" stroke-dasharray="5,3"/>
    
    <!-- Table Headers -->
    <text x="16" y="262" font-size="13" class="t-bold" fill="#000000">Newspaper</text>
    <text x="384" y="262" font-size="13" class="t-bold" fill="#000000" text-anchor="end">Amount Rs.</text>
    <line x1="16" y1="274" x2="384" y2="274" stroke="#000000" stroke-width="1" stroke-dasharray="4,2"/>

    <!-- Dynamic Line Items -->
    ${itemRowsSvg}
    
    <!-- Dashed Divider -->
    <line x1="16" y1="${dividerY}" x2="384" y2="${dividerY}" stroke="#000000" stroke-width="1.2" stroke-dasharray="5,3"/>
    
    <!-- Last month's balance, only when there is one -->
    ${Math.abs(earlier) >= 0.01 ? `
    <text x="16" y="${earlierY}" font-size="13" class="t-reg" fill="#000000">${earlier > 0 ? 'Previous Balance' : 'Advance'}</text>
    <text x="384" y="${earlierY}" font-size="14" class="t-bold" fill="#000000" text-anchor="end">${earlier > 0 ? '' : '- '}Rs. ${Math.abs(earlier).toFixed(2)}</text>
    ` : ''}

    <!-- Boxed Total Banner -->
    <rect x="16" y="${totalBoxY}" width="368" height="38" rx="6" fill="#ffffff" stroke="#000000" stroke-width="2"/>
    <text x="32" y="${totalBoxY + 25}" font-size="15" class="t-bold" fill="#000000">TOTAL PAYABLE</text>
    <text x="368" y="${totalBoxY + 26}" font-size="18" class="t-bold" fill="#000000" text-anchor="end">Rs. ${totalAmt}</text>
    
    <!-- Dynamic UPI QR Code -->
    <g transform="translate(130, ${qrY})">
      <rect width="140" height="140" fill="#ffffff" stroke="#e2e8f0" rx="4"/>
      ${upiQrSvgInner}
    </g>
    
    <text x="200" y="${qrText1Y}" font-size="13" class="t-bold" fill="#000000" text-anchor="middle">Scan &amp; Pay Rs. ${Math.round(Number(totalAmt))} via any UPI app</text>
    <text x="200" y="${qrText2Y}" font-size="11.5" class="t-reg" fill="#000000" text-anchor="middle">GooglePay / PhonePe / Paytm / BHIM</text>
    
    <!-- Dashed Divider -->
    <line x1="16" y1="${footerDividerY}" x2="384" y2="${footerDividerY}" stroke="#000000" stroke-width="1.2" stroke-dasharray="5,3"/>
    
    <!-- Footer Notice -->
    <text x="200" y="${footerNotice1Y}" font-size="11" class="t-bold" fill="#000000" text-anchor="middle">Please pay the bill before 5th of the month.</text>
    <text x="200" y="${footerNotice2Y}" font-size="10.5" class="t-mid" fill="#000000" text-anchor="middle">After payment kindly send screenshot on WhatsApp.</text>
    <text x="200" y="${footerNotice3Y}" font-size="11" class="t-reg" fill="#000000" text-anchor="middle">Queries: WhatsApp 9462558949</text>
    <text x="200" y="${footerThankYouY}" font-size="13" class="t-bold" fill="#000000" text-anchor="middle">Thank You!</text>
    </g>
  </svg>
  `;

  return svgToPng(svg);
}

/**
 * POST /api/whatsapp/send
 * Supports:
 * - Single Bill send by bill_id or customer_id
 * - Test send to custom phone number (e.g. 919887500875)
 * - Bulk select by customer IDs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      bill_id, 
      customer_id, 
      test_phone, 
      selected_customer_ids, 
      bills,
      month = 'Sep 2026' 
    } = body;

    // Check token presence securely from vault or env
    const secureToken = getSecureWhatsAppToken();
    if (!secureToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'WhatsApp API credentials could not be loaded securely' 
      }, { status: 400 });
    }

    // 1. Batch Direct Send (Full Bill Objects from UI)
    if (Array.isArray(bills) && bills.length > 0) {
      const results: any[] = [];

      for (const b of bills) {
        const rawPhone = b.phone;
        if (!rawPhone || rawPhone === '---') {
          results.push({ 
            customer_id: b.customer_id, 
            customer_name: b.customer_name, 
            status: 'skipped', 
            reason: 'No phone' 
          });
          continue;
        }

        const rawPhones = String(rawPhone).split(',').map((p: string) => p.trim()).filter(Boolean);
        const validPhones = rawPhones.map((p: string) => formatWhatsAppPhone(p)).filter(Boolean) as string[];

        if (validPhones.length === 0) {
          results.push({ 
            customer_id: b.customer_id, 
            customer_name: b.customer_name, 
            phone: rawPhone,
            status: 'skipped', 
            reason: 'Invalid phone format' 
          });
          continue;
        }

        const billMonth = `${b.month || ''} ${b.year || ''}`.trim() || month;

        for (const phone of validPhones) {
          try {
            let imageBuffer: Buffer;
            if (b.image_base64) {
              const cleanB64 = b.image_base64.replace(/^data:image\/\w+;base64,/, '');
              imageBuffer = Buffer.from(cleanB64, 'base64');
            } else {
              const billData = {
                bill_no: String(b.bill_no || b.customer_id),
                customer_id: String(b.customer_id),
                customer_name: b.customer_name || 'CUSTOMER',
                customer_hindi: b.customer_hindi || b.customer_name || '',
                month: billMonth,
                region_name: b.region_name || b.region_id || '',
                phone,
                items: b.items || [],
                delivery_charge: Number(b.delivery_charge || 0),
                paper_amount: Number(b.paper_amount || 0),
                current_bill: b.current_bill,
                paid_amount: Number(b.paid_amount || 0),
                previous_due: Number(b.previous_due || 0),
                net_payable: Number(b.net_payable || 0)
              };
              imageBuffer = await generateBillPngBuffer(billData);
            }

            const sendPayload = {
              toPhone: phone,
              customerName: whatsAppDisplayName(b.customer_name, b.customer_hindi),
              month: billMonth,
              billNo: String(b.bill_no || b.customer_id),
              accountNo: String(b.customer_id),
              currentAmount: billCurrentAmount(b),
              previousDue: textPreviousDue(b),
              totalPayable: Number(b.net_payable || 0),
              billImageBuffer: imageBuffer,
              imageFileName: `Bill_${b.bill_no || b.customer_id}.png`
            };

            const res = await sendWhatsAppBillMessage(sendPayload);

            // Log to database
            try {
              await logWhatsAppMessage({
                customer_id: String(b.customer_id),
                bill_id: String(b.bill_no || b.customer_id),
                phone,
                wamid: res.wamid || null,
                status: res.success ? 'sent' : 'failed',
                error_code: res.errorCode || null,
                error_json: res.errorJson || null,
                media_id: res.mediaId || null,
                bill_month: billMonth,
                total_amount: Number(b.net_payable || 0)
              });
            } catch (dbErr) {
              console.warn('[WhatsApp Route] Error logging to database:', dbErr);
            }

            results.push({ 
              customer_id: b.customer_id, 
              customer_name: b.customer_name, 
              phone, 
              ...res 
            });
          } catch (itemErr: any) {
            results.push({ 
              customer_id: b.customer_id, 
              customer_name: b.customer_name, 
              phone, 
              status: 'failed', 
              error: itemErr?.message || String(itemErr) 
            });
          }
        }
      }

      const sentCount = results.filter(r => r.success).length;
      const skippedCount = results.filter(r => r.status === 'skipped').length;
      const failedCount = results.filter(r => r.status === 'failed' || (r.success === false && r.status !== 'skipped')).length;

      return NextResponse.json({ 
        success: true, 
        count: results.length, 
        sent_count: sentCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
        results 
      });
    }

    // 2. Single Direct Send (Real Bill Data)
    if (test_phone || body.phone) {
      const targetPhone = test_phone || body.phone;
      const cleanPhone = formatWhatsAppPhone(targetPhone);
      if (!cleanPhone) {
        return NextResponse.json({ success: false, error: 'Invalid phone number format' }, { status: 400 });
      }

      // Check if client provided exact rendered bill PNG (base64)
      let imageBuffer: Buffer;
      if (body.image_base64) {
        const cleanB64 = body.image_base64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(cleanB64, 'base64');
      } else {
        const billData = {
          bill_no: String(body.bill_id || body.bill_no || '37210'),
          customer_id: String(body.customer_id || '24669'),
          customer_name: body.customer_name || 'WHATSAPP SAMPLE',
          customer_hindi: body.customer_hindi || 'व्हाट्सएप सैम्पल',
          month: body.month || month,
          region_name: body.region_name || 'WhatsApp',
          phone: cleanPhone,
          items: body.items || [],
          delivery_charge: Number(body.delivery_charge || 0),
          paper_amount: Number(body.paper_amount || 0),
          current_bill: body.current_bill,
          paid_amount: Number(body.paid_amount || 0),
          previous_due: Number(body.previous_due || 0),
          net_payable: Number(body.net_payable || 0)
        };
        imageBuffer = await generateBillPngBuffer(billData);
      }

      const activeBill = {
        bill_no: String(body.bill_id || body.bill_no || '37210'),
        customer_id: String(body.customer_id || '24669'),
        customer_name: whatsAppDisplayName(body.customer_name, body.customer_hindi),
        month: body.month || month,
        current_amount: billCurrentAmount(body),
        previous_due: textPreviousDue(body),
        total_payable: Number(body.net_payable || 0)
      };

      const res = await sendWhatsAppBillMessage({
        toPhone: cleanPhone,
        customerName: activeBill.customer_name,
        month: activeBill.month,
        billNo: activeBill.bill_no,
        accountNo: activeBill.customer_id,
        currentAmount: activeBill.current_amount,
        previousDue: activeBill.previous_due,
        totalPayable: activeBill.total_payable,
        billImageBuffer: imageBuffer,
        imageFileName: `Bill_${activeBill.bill_no}.png`
      });

      // Log to database
      await logWhatsAppMessage({
        customer_id: activeBill.customer_id,
        bill_id: activeBill.bill_no,
        phone: cleanPhone,
        wamid: res.wamid || null,
        status: res.success ? 'sent' : 'failed',
        error_code: res.errorCode || null,
        error_json: res.errorJson || null,
        media_id: res.mediaId || null,
        bill_month: activeBill.month,
        total_amount: activeBill.total_payable
      });

      return NextResponse.json(res);
    }

    // 2. Selective Batch Send (Selected Customers Only)
    if (Array.isArray(selected_customer_ids) && selected_customer_ids.length > 0) {
      const results: any[] = [];

      for (const cid of selected_customer_ids) {
        // Fetch customer + bill data from Supabase (check primary customer table first)
        let { data: cust } = await supabaseAdmin
          .from('customer')
          .select('*')
          .eq('customer_id', cid)
          .single();

        if (!cust) {
          const { data: legacyCust } = await supabaseAdmin
            .from('customers')
            .select('*')
            .eq('customer_id', cid)
            .single();
          cust = legacyCust;
        }

        if (!cust || !cust.phone) {
          results.push({ customer_id: cid, status: 'skipped', reason: 'No phone' });
          continue;
        }

        // Support multiple comma-separated phones if customer has more than one
        const rawPhones = String(cust.phone).split(',').map((p: string) => p.trim()).filter(Boolean);
        const validPhones = rawPhones.map((p: string) => formatWhatsAppPhone(p)).filter(Boolean) as string[];

        if (validPhones.length === 0) {
          results.push({ customer_id: cid, status: 'skipped', reason: 'Invalid phone format' });
          continue;
        }

        for (const phone of validPhones) {
          const billData = {
            bill_no: String(cid),
            customer_id: String(cid),
            customer_name: cust.name_eng || `Customer #${cid}`,
            customer_hindi: storedHindiName(cust) || cust.name_eng || '',
            month,
            region_name: cust.region_id || '',
            phone,
            paper_amount: 1000.00,
            previous_due: 0.00,
            net_payable: 1000.00
          };

          const imageBuffer = await generateBillPngBuffer(billData);

          const res = await sendWhatsAppBillMessage({
            toPhone: phone,
            customerName: whatsAppDisplayName(cust.name_eng || `Customer #${cid}`, storedHindiName(cust)),
            month: billData.month,
            billNo: billData.bill_no,
            accountNo: billData.customer_id,
            currentAmount: billData.paper_amount,
            previousDue: billData.previous_due,
            totalPayable: billData.net_payable,
            billImageBuffer: imageBuffer,
            imageFileName: `Bill_${billData.bill_no}.png`
          });

          // Insert tracking row
          await logWhatsAppMessage({
            customer_id: String(cid),
            bill_id: billData.bill_no,
            phone,
            wamid: res.wamid || null,
            status: res.success ? 'sent' : 'failed',
            error_code: res.errorCode || null,
            error_json: res.errorJson || null,
            media_id: res.mediaId || null,
            bill_month: month,
            total_amount: billData.net_payable
          });

          results.push({ customer_id: cid, phone, ...res });
        }
      }

      return NextResponse.json({ success: true, count: results.length, results });
    }

    return NextResponse.json({ error: 'Missing parameters. Provide bills, test_phone, bill_id, or selected_customer_ids.' }, { status: 400 });
  } catch (err: any) {
    console.error('API Send Error:', err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
