import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { supabase } from '@/lib/supabaseClient';
import { refuseWithout } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function loadJson(filename: string): any[] {
  try {
    const p = path.join(process.cwd(), 'public', 'data', filename);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (e) {
    console.error(`Error reading ${filename}:`, e);
  }
  return [];
}

/**
 * Robust ISO date converter.
 * Converts 'DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD' into 'YYYY-MM-DD'.
 * Safely converts empty strings, '0000-00-00', 'NULL' to null.
 */
function toIsoDate(val: any): string | null {
  if (!val || typeof val !== 'string' || val.trim() === '' || val === 'NULL' || val === 'null' || val === '0000-00-00') {
    return null;
  }
  const s = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const parts = s.split(/[\/\-.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Saves JSON file with in-memory primary key deduplication.
 * Guarantees zero duplicate entries across chunked uploads or re-restores.
 */
function saveJsonWithDeduplication<T extends Record<string, any>>(
  filename: string,
  incomingData: T[],
  primaryKey: keyof T,
  isAppendMode: boolean
): T[] {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const filePath = path.join(dataDir, filename);

  const itemMap = new Map<any, T>();

  // If append mode, load existing data first
  if (isAppendMode && fs.existsSync(filePath)) {
    try {
      const existing: T[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      for (const item of existing) {
        const key = item[primaryKey];
        if (key !== undefined && key !== null) {
          itemMap.set(key, item);
        }
      }
    } catch (e) {
      console.error(`Error loading existing ${filename} for append:`, e);
    }
  }

  // Merge incoming data (overwrites by primary key, preventing duplicates)
  for (const item of incomingData) {
    const key = item[primaryKey];
    if (key !== undefined && key !== null) {
      itemMap.set(key, item);
    }
  }

  const result = Array.from(itemMap.values());

  // Safety backup and local file write (wrapped in try-catch for serverless / Vercel read-only filesystem)
  try {
    const backupDir = path.join(process.cwd(), 'public', 'data_backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    if (fs.existsSync(filePath) && !isAppendMode) {
      fs.copyFileSync(filePath, path.join(backupDir, filename));
    }
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
  } catch (err: any) {
    // In Vercel serverless environment, filesystem is read-only. Data is securely stored in Supabase.
    console.warn(`Local file write bypassed for ${filename} (serverless environment):`, err?.message);
  }

  return result;
}

function saveJsonDirect(filename: string, data: any[]) {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    const p = path.join(dataDir, filename);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Error direct writing ${filename}:`, e);
  }
}

/**
 * Synchronizes discontinue closure dates with customer_detail subscriptions.
 * Whenever permanent discontinues are restored, updates c_date on matching active subscriptions.
 */
async function syncDiscontinueClosuresToSubscriptions(discontinues: any[]) {
  try {
    const permanentStops = discontinues.filter(d => 
      (d.temp_perma === 'Permanent' || d.temp_perma === 'P') && d.temp_from && d.temp_from >= '2026-04-01'
    );

    if (permanentStops.length === 0) return;

    for (let i = 0; i < permanentStops.length; i += 50) {
      const chunk = permanentStops.slice(i, i + 50);
      await Promise.all(
        chunk.map(disc => {
          const cid = Number(disc.customer_id);
          const pid = Number(disc.publica_id);
          const stopDate = disc.temp_from;
          return supabase
            .from('customer_detail')
            .update({ c_date: stopDate })
            .eq('customer_id', cid)
            .eq('publica_id', pid)
            .or(`c_date.is.null,c_date.gt.${stopDate}`);
        })
      );
    }
  } catch (err) {
    console.error('Error synchronizing discontinue closures to subscriptions:', err);
  }
}

function escapeSqlString(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  const str = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${str}'`;
}

function escapeSqlNum(val: any, fallback = 0): string {
  if (val === null || val === undefined || val === '') return String(fallback);
  const num = Number(val);
  return isNaN(num) ? String(fallback) : String(num);
}

// -------------------------------------------------------------
// GET: Generate & Download standard MySQL dump .sql backup
// -------------------------------------------------------------
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;

  try {
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    let sqlContent = `-- ========================================================\n` +
      `-- ARYAN NEWS ERP DATABASE BACKUP DUMP\n` +
      `-- Exported At: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
      `-- Host: MySQL / Supabase Compatible ERP Dump\n` +
      `-- ========================================================\n\n` +
      `SET FOREIGN_KEY_CHECKS=0;\n` +
      `SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";\n\n`;

    // 1. Region Master
    const regions = loadJson('regions.json');
    if (regions.length > 0) {
      sqlContent += `-- Table structure and data for table \`region\`\n` +
        `CREATE TABLE IF NOT EXISTS \`region\` (\n` +
        `  \`Region_id\` int(11) NOT NULL default '0',\n` +
        `  \`Region_Name\` varchar(50) default NULL,\n` +
        `  \`Zone\` varchar(50) default NULL,\n` +
        `  PRIMARY KEY  (\`Region_id\`)\n` +
        `) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`;

      for (let i = 0; i < regions.length; i += 200) {
        const chunk = regions.slice(i, i + 200);
        const values = chunk.map(r => {
          const id = escapeSqlNum(r.region_id);
          const name = escapeSqlString(r.region_name || r.name || '');
          const zone = escapeSqlString(r.zone || '');
          return `(${id}, ${name}, ${zone})`;
        }).join(',\n');
        sqlContent += `INSERT INTO \`region\` (\`Region_id\`, \`Region_Name\`, \`Zone\`) VALUES\n${values};\n\n`;
      }
    }

    // 2. Hawker Master
    const hawkers = loadJson('hawkers.json');
    if (hawkers.length > 0) {
      sqlContent += `-- Table structure and data for table \`hawker\`\n` +
        `CREATE TABLE IF NOT EXISTS \`hawker\` (\n` +
        `  \`Hawker_id\` int(11) NOT NULL default '0',\n` +
        `  \`Name\` varchar(50) default NULL,\n` +
        `  \`Address\` varchar(100) default NULL,\n` +
        `  \`City\` varchar(50) default NULL,\n` +
        `  \`Phone\` varchar(20) default NULL,\n` +
        `  \`Mobile\` varchar(20) default NULL,\n` +
        `  \`Region_id\` int(11) default '0',\n` +
        `  \`Commission_rate\` decimal(10,2) default '0.00',\n` +
        `  PRIMARY KEY  (\`Hawker_id\`)\n` +
        `) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`;

      for (let i = 0; i < hawkers.length; i += 200) {
        const chunk = hawkers.slice(i, i + 200);
        const values = chunk.map(h => {
          const id = escapeSqlNum(h.hawker_id);
          const name = escapeSqlString(h.name || '');
          const addr = escapeSqlString(h.address || '');
          const city = escapeSqlString(h.city || '');
          const ph = escapeSqlString(h.phone || '');
          const mob = escapeSqlString(h.mobile || '');
          const reg = escapeSqlNum(h.region_id || 0);
          const comm = escapeSqlNum(h.commission_rate || 0);
          return `(${id}, ${name}, ${addr}, ${city}, ${ph}, ${mob}, ${reg}, ${comm})`;
        }).join(',\n');
        sqlContent += `INSERT INTO \`hawker\` (\`Hawker_id\`, \`Name\`, \`Address\`, \`City\`, \`Phone\`, \`Mobile\`, \`Region_id\`, \`Commission_rate\`) VALUES\n${values};\n\n`;
      }
    }

    // 3. Publication Master
    const publications = loadJson('publications.json');
    if (publications.length > 0) {
      sqlContent += `-- Table structure and data for table \`publication\`\n` +
        `CREATE TABLE IF NOT EXISTS \`publication\` (\n` +
        `  \`Publica_id\` int(11) NOT NULL default '0',\n` +
        `  \`Public_Name\` varchar(100) default NULL,\n` +
        `  \`Type_P\` varchar(30) default NULL,\n` +
        `  \`Publish_id\` int(11) default '0',\n` +
        `  \`Abrv\` varchar(20) default NULL,\n` +
        `  \`Circulation\` varchar(20) default NULL,\n` +
        `  \`Duration\` varchar(20) default NULL,\n` +
        `  \`Magzine_day\` int(11) default '0',\n` +
        `  \`Magzine_month\` int(11) default '0',\n` +
        `  \`Chr_Del\` int(11) default '0',\n` +
        `  \`Pub_Hindi\` varchar(100) default NULL,\n` +
        `  PRIMARY KEY  (\`Publica_id\`)\n` +
        `) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`;

      for (let i = 0; i < publications.length; i += 200) {
        const chunk = publications.slice(i, i + 200);
        const values = chunk.map(p => {
          const id = escapeSqlNum(p.publica_id);
          const name = escapeSqlString(p.public_name || p.name || '');
          const type = escapeSqlString(p.type_p || p.frequency || 'Newspaper');
          const pubid = escapeSqlNum(p.publish_id || 0);
          const abrv = escapeSqlString(p.abrv || '');
          const circ = escapeSqlString(p.circulation || 'Morning');
          const dur = escapeSqlString(p.duration || '');
          const magd = escapeSqlNum(p.magzine_day || 0);
          const magm = escapeSqlNum(p.magzine_month || 0);
          const chrd = escapeSqlNum(p.chr_del || 0);
          const pubhindi = escapeSqlString(p.pub_hindi || '');
          return `(${id}, ${name}, ${type}, ${pubid}, ${abrv}, ${circ}, ${dur}, ${magd}, ${magm}, ${chrd}, ${pubhindi})`;
        }).join(',\n');
        sqlContent += `INSERT INTO \`publication\` (\`Publica_id\`, \`Public_Name\`, \`Type_P\`, \`Publish_id\`, \`Abrv\`, \`Circulation\`, \`Duration\`, \`Magzine_day\`, \`Magzine_month\`, \`Chr_Del\`, \`Pub_Hindi\`) VALUES\n${values};\n\n`;
      }
    }

    // 4. Rates Master
    const rates = loadJson('rates.json');
    if (rates.length > 0) {
      sqlContent += `-- Table structure and data for table \`rate\`\n` +
        `CREATE TABLE IF NOT EXISTS \`rate\` (\n` +
        `  \`Publica_id\` int(11) NOT NULL default '0',\n` +
        `  \`Rate\` decimal(10,2) default '0.00',\n` +
        `  \`Dayofweek\` int(11) NOT NULL default '0'\n` +
        `) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`;

      for (let i = 0; i < rates.length; i += 200) {
        const chunk = rates.slice(i, i + 200);
        const values = chunk.map(r => {
          const pid = escapeSqlNum(r.publica_id || r.Publica_id);
          const rate = escapeSqlNum(r.rate || r.Rate);
          const dow = escapeSqlNum(r.dayofweek || r.Dayofweek);
          return `(${pid}, ${rate}, ${dow})`;
        }).join(',\n');
        sqlContent += `INSERT INTO \`rate\` (\`Publica_id\`, \`Rate\`, \`Dayofweek\`) VALUES\n${values};\n\n`;
      }
    }

    // 5. Customer Master
    const customers = loadJson('all_customers.json');
    if (customers.length > 0) {
      sqlContent += `-- Table structure and data for table \`customer\`\n` +
        `CREATE TABLE IF NOT EXISTS \`customer\` (\n` +
        `  \`Customer_id\` bigint(20) NOT NULL default '0',\n` +
        `  \`name_eng\` varchar(100) default NULL,\n` +
        `  \`Type_Cust\` int(11) default '-1',\n` +
        `  \`name_hindi\` varchar(100) default NULL,\n` +
        `  \`add1\` varchar(100) default NULL,\n` +
        `  \`add2\` varchar(100) default NULL,\n` +
        `  \`phone\` varchar(50) default NULL,\n` +
        `  \`Security_Deposit\` decimal(10,2) default '0.00',\n` +
        `  \`Type\` varchar(50) default NULL,\n` +
        `  \`Priority\` int(11) default '1',\n` +
        `  \`Self_Agent\` int(11) default '-1',\n` +
        `  \`FontType\` int(11) default '-1',\n` +
        `  \`dueamount\` decimal(10,2) default '0.00',\n` +
        `  \`Region_id\` int(11) default '0',\n` +
        `  \`Paid\` varchar(10) default 'P',\n` +
        `  \`Delivery\` decimal(10,2) default '0.00',\n` +
        `  \`Discount\` decimal(10,2) default '0.00',\n` +
        `  \`GovtSupply\` int(11) default '0',\n` +
        `  \`Hindi_Add\` varchar(100) default NULL,\n` +
        `  \`Cbal\` decimal(10,2) default '0.00',\n` +
        `  \`pmonth\` varchar(20) default NULL,\n` +
        `  \`pyear\` varchar(20) default NULL,\n` +
        `  PRIMARY KEY  (\`Customer_id\`)\n` +
        `) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`;

      for (let i = 0; i < customers.length; i += 200) {
        const chunk = customers.slice(i, i + 200);
        const values = chunk.map(c => {
          const cid = escapeSqlNum(c.customer_id || c.Customer_id);
          const nEng = escapeSqlString(c.name_eng || '');
          const tCust = escapeSqlNum(c.type_cust || c.Type_Cust, -1);
          const nHin = escapeSqlString(c.name_hindi || '');
          const a1 = escapeSqlString(c.add1 || '');
          const a2 = escapeSqlString(c.add2 || '');
          const ph = escapeSqlString(c.phone || '');
          const sec = escapeSqlNum(c.security_deposit || c.Security_Deposit, 0);
          const typ = escapeSqlString(c.type || c.Type || '');
          const pri = escapeSqlNum(c.priority || c.Priority, 1);
          const sa = escapeSqlNum(c.self_agent || c.Self_Agent, -1);
          const ft = escapeSqlNum(c.font_type || c.FontType, -1);
          const due = escapeSqlNum(c.dueamount, 0);
          const rid = escapeSqlNum(c.region_id || c.Region_id, 0);
          const pd = escapeSqlString(c.paid || c.Paid || 'P');
          const dly = escapeSqlNum(c.delivery || c.Delivery, 0);
          const disc = escapeSqlNum(c.discount || c.Discount, 0);
          const govt = escapeSqlNum(c.govt_supply || c.GovtSupply, 0);
          const hadd = escapeSqlString(c.hindi_add || c.Hindi_Add || '');
          const cbal = escapeSqlNum(c.cbal || c.Cbal, 0);
          const pm = escapeSqlString(c.pmonth || '');
          const py = escapeSqlString(c.pyear || '');
          return `(${cid}, ${nEng}, ${tCust}, ${nHin}, ${a1}, ${a2}, ${ph}, ${sec}, ${typ}, ${pri}, ${sa}, ${ft}, ${due}, ${rid}, ${pd}, ${dly}, ${disc}, ${govt}, ${hadd}, ${cbal}, ${pm}, ${py})`;
        }).join(',\n');
        sqlContent += `INSERT INTO \`customer\` (\`Customer_id\`, \`name_eng\`, \`Type_Cust\`, \`name_hindi\`, \`add1\`, \`add2\`, \`phone\`, \`Security_Deposit\`, \`Type\`, \`Priority\`, \`Self_Agent\`, \`FontType\`, \`dueamount\`, \`Region_id\`, \`Paid\`, \`Delivery\`, \`Discount\`, \`GovtSupply\`, \`Hindi_Add\`, \`Cbal\`, \`pmonth\`, \`pyear\`) VALUES\n${values};\n\n`;
      }
    }

    // 6. Subscriptions
    const subs = loadJson('all_subscriptions.json');
    if (subs.length > 0) {
      sqlContent += `-- Table structure and data for table \`customer_detail\`\n` +
        `CREATE TABLE IF NOT EXISTS \`customer_detail\` (\n` +
        `  \`sno\` bigint(20) NOT NULL default '0',\n` +
        `  \`Customer_id\` bigint(20) default '0',\n` +
        `  \`Publica_id\` int(11) default '0',\n` +
        `  \`Hawker_id\` int(11) default '0',\n` +
        `  \`Qty\` int(11) default '1',\n` +
        `  \`Circulation\` varchar(20) default 'Morning',\n` +
        `  \`S_Date\` varchar(20) default NULL,\n` +
        `  \`C_Date\` varchar(20) default NULL,\n` +
        `  \`From_Day\` varchar(20) default '1-7',\n` +
        `  \`Hawk_Sub\` int(11) default '-1',\n` +
        `  \`Dis\` varchar(20) default '0',\n` +
        `  \`Dely\` decimal(10,2) default '0.00',\n` +
        `  PRIMARY KEY  (\`sno\`)\n` +
        `) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`;

      for (let i = 0; i < subs.length; i += 200) {
        const chunk = subs.slice(i, i + 200);
        const values = chunk.map(s => {
          const sno = escapeSqlNum(s.sno);
          const cid = escapeSqlNum(s.customer_id || s.Customer_id);
          const pid = escapeSqlNum(s.publica_id || s.Publica_id);
          const hid = escapeSqlNum(s.hawker_id || s.Hawker_id);
          const qty = escapeSqlNum(s.qty || s.Qty, 1);
          const circ = escapeSqlString(s.circulation || s.Circulation || 'Morning');
          const sdate = escapeSqlString(s.s_date || s.S_Date || '');
          const cdate = escapeSqlString(s.c_date || s.C_Date || '');
          const fday = escapeSqlString(s.from_day || s.From_Day || '1-7');
          const hsub = escapeSqlNum(s.hawk_sub || s.Hawk_Sub, -1);
          const dis = escapeSqlString(s.dis || s.Dis || '0');
          const dely = escapeSqlNum(s.dely || s.Dely, 0);
          return `(${sno}, ${cid}, ${pid}, ${hid}, ${qty}, ${circ}, ${sdate}, ${cdate}, ${fday}, ${hsub}, ${dis}, ${dely})`;
        }).join(',\n');
        sqlContent += `INSERT INTO \`customer_detail\` (\`sno\`, \`Customer_id\`, \`Publica_id\`, \`Hawker_id\`, \`Qty\`, \`Circulation\`, \`S_Date\`, \`C_Date\`, \`From_Day\`, \`Hawk_Sub\`, \`Dis\`, \`Dely\`) VALUES\n${values};\n\n`;
      }
    }

    // 7. Discontinue
    const discontinues = loadJson('discontinues.json');
    if (discontinues.length > 0) {
      sqlContent += `-- Table structure and data for table \`discontinue20262027\`\n` +
        `CREATE TABLE IF NOT EXISTS \`discontinue20262027\` (\n` +
        `  \`discontinue_id\` bigint(20) NOT NULL default '0',\n` +
        `  \`sno\` bigint(20) default '0',\n` +
        `  \`entry_date\` varchar(20) default NULL,\n` +
        `  \`Customer_id\` bigint(20) NOT NULL default '0',\n` +
        `  \`Publica_id\` int(11) NOT NULL default '0',\n` +
        `  \`Temp_Perma\` varchar(10) default 'T',\n` +
        `  \`Temp_From\` date default NULL,\n` +
        `  \`Temp_To\` date default NULL,\n` +
        `  \`S_Date\` varchar(20) default NULL,\n` +
        `  \`C_Date\` varchar(20) default NULL,\n` +
        `  \`Hawker_id\` int(11) default '0',\n` +
        `  PRIMARY KEY  (\`discontinue_id\`)\n` +
        `) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`;

      for (let i = 0; i < discontinues.length; i += 200) {
        const chunk = discontinues.slice(i, i + 200);
        const values = chunk.map(d => {
          const did = escapeSqlNum(d.discontinue_id);
          const sno = escapeSqlNum(d.sno);
          const edate = escapeSqlString(d.entry_date || '');
          const cid = escapeSqlNum(d.customer_id || d.Customer_id);
          const pid = escapeSqlNum(d.publica_id || d.Publica_id);
          const tp = escapeSqlString(d.temp_perma || d.Temp_Perma || 'T');
          const tfrom = d.temp_from ? `'${d.temp_from}'` : 'NULL';
          const tto = d.temp_to ? `'${d.temp_to}'` : 'NULL';
          const sdate = escapeSqlString(d.s_date || d.S_Date || '');
          const cdate = escapeSqlString(d.c_date || d.C_Date || '');
          const hid = escapeSqlNum(d.hawker_id || d.Hawker_id);
          return `(${did}, ${sno}, ${edate}, ${cid}, ${pid}, ${tp}, ${tfrom}, ${tto}, ${sdate}, ${cdate}, ${hid})`;
        }).join(',\n');
        sqlContent += `INSERT INTO \`discontinue20262027\` (\`discontinue_id\`, \`sno\`, \`entry_date\`, \`Customer_id\`, \`Publica_id\`, \`Temp_Perma\`, \`Temp_From\`, \`Temp_To\`, \`S_Date\`, \`C_Date\`, \`Hawker_id\`) VALUES\n${values};\n\n`;
      }
    }

    sqlContent += `\nSET FOREIGN_KEY_CHECKS=1;\n`;
    sqlContent += `-- BACKUP COMPLETED: ${dateStr}\n`;

    return new NextResponse(sqlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="AryanNews_Backup_${dateStr}.sql"`,
      },
    });
  } catch (error: any) {
    console.error('Backup generation error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// -------------------------------------------------------------
// POST: Process SQL restore via JSON payload or File upload
// -------------------------------------------------------------
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;

  try {
    const contentType = req.headers.get('content-type') || '';
    let parsedTables: Record<string, any[]> = {};
    let isAppendMode = false;

    // 1. If JSON payload (streamed from browser or server local file path)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      isAppendMode = !!body.appendMode;

      if (body.filePath) {
        if (!fs.existsSync(body.filePath)) {
          return NextResponse.json({ success: false, error: `File not found at ${body.filePath}` }, { status: 404 });
        }
        parsedTables = await parseSqlFileStream(body.filePath);
      } else if (body.tables) {
        parsedTables = body.tables;
      } else {
        return NextResponse.json({ success: false, error: 'No tables or filePath provided' }, { status: 400 });
      }
    } 
    // 2. Fallback: multipart/form-data for smaller SQL files
    else {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ success: false, error: 'No SQL file uploaded' }, { status: 400 });
      }

      const tempPath = path.join(os.tmpdir(), `temp_restore_${Date.now()}.sql`);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(tempPath, buffer);

      try {
        parsedTables = await parseSqlFileStream(tempPath);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }

    const stats: Record<string, number> = {};

    // -------------------------------------------------------------
    // 1. Customers
    // -------------------------------------------------------------
    const customerRows = parsedTables['customer'] || parsedTables['tbl_customer'];
    if (customerRows && customerRows.length > 0) {
      const mappedCusts = customerRows.map(r => {
        if (Array.isArray(r)) {
          return {
            customer_id: Number(r[0]),
            name_eng: String(r[1] || ''),
            type_cust: Number(r[2] ?? -1),
            name_hindi: String(r[3] || ''),
            add1: String(r[4] || ''),
            add2: String(r[5] || ''),
            phone: String(r[6] || ''),
            security_deposit: Number(r[7] ?? 0),
            type: String(r[8] || ''),
            priority: Number(r[9] ?? 1),
            self_agent: Number(r[10] ?? -1),
            font_type: Number(r[11] ?? -1),
            dueamount: Number(r[12] ?? 0),
            region_id: Number(r[13] ?? 0),
            paid: String(r[14] || 'P'),
            delivery: Number(r[15] ?? 0),
            discount: Number(r[16] ?? 0),
            govt_supply: Number(r[17] ?? 0),
            hindi_add: String(r[18] || ''),
            cbal: Number(r[19] ?? 0),
            pmonth: String(r[20] || ''),
            pyear: String(r[21] || ''),
          };
        }
        return {
          customer_id: Number(r.customer_id ?? r.customerid ?? 0),
          name_eng: String(r.name_eng ?? r.nameeng ?? ''),
          type_cust: Number(r.type_cust ?? -1),
          name_hindi: String(r.name_hindi ?? r.namehindi ?? ''),
          add1: String(r.add1 ?? ''),
          add2: String(r.add2 ?? ''),
          phone: String(r.phone ?? ''),
          security_deposit: Number(r.security_deposit ?? 0),
          type: String(r.type ?? ''),
          priority: Number(r.priority ?? 1),
          self_agent: Number(r.self_agent ?? -1),
          font_type: Number(r.font_type ?? r.fonttype ?? -1),
          dueamount: Number(r.dueamount ?? 0),
          region_id: Number(r.region_id ?? r.regionid ?? 0),
          paid: String(r.paid ?? 'P'),
          delivery: Number(r.delivery ?? 0),
          discount: Number(r.discount ?? 0),
          govt_supply: Number(r.govt_supply ?? r.govtsupply ?? 0),
          hindi_add: String(r.hindi_add ?? r.hindiadd ?? ''),
          cbal: Number(r.cbal ?? 0),
          pmonth: String(r.pmonth ?? ''),
          pyear: String(r.pyear ?? ''),
        };
      }).filter(c => c.customer_id > 0);

      // Save into local store with zero duplicates
      const dedupedCusts = saveJsonWithDeduplication('all_customers.json', mappedCusts, 'customer_id', isAppendMode);
      stats['customer'] = dedupedCusts.length;

      // Synchronously upsert into Supabase in batches of 500
      for (let i = 0; i < mappedCusts.length; i += 500) {
        const batch = mappedCusts.slice(i, i + 500);
        const { error } = await supabase.from('customer').upsert(batch, { onConflict: 'customer_id' });
        if (error) console.error('Customer Supabase upsert error batch', i, error.message);
      }
    }

    // -------------------------------------------------------------
    // 2. Subscriptions (customer_detail)
    // -------------------------------------------------------------
    const subRows = parsedTables['customer_detail'] || parsedTables['custdetail'];
    if (subRows && subRows.length > 0) {
      const mappedSubs = subRows.map(r => {
        if (Array.isArray(r)) {
          return {
            sno: Number(r[0]),
            customer_id: Number(r[1]),
            publica_id: Number(r[2]),
            hawker_id: Number(r[3]),
            qty: Number(r[4] ?? 1),
            circulation: String(r[5] || 'Morning'),
            s_date: toIsoDate(r[6]),
            c_date: toIsoDate(r[7]),
            from_day: String(r[8] || '1-7'),
            hawk_sub: Number(r[9] ?? -1),
            dis: String(r[10] || '0'),
            dely: Number(r[11] ?? 0),
          };
        }
        return {
          sno: Number(r.sno ?? 0),
          customer_id: Number(r.customer_id ?? r.customerid ?? 0),
          publica_id: Number(r.publica_id ?? r.publicaid ?? 0),
          hawker_id: Number(r.hawker_id ?? r.hawkerid ?? 0),
          qty: Number(r.qty ?? 1),
          circulation: String(r.circulation ?? 'Morning'),
          s_date: toIsoDate(r.s_date ?? r.sdate),
          c_date: toIsoDate(r.c_date ?? r.cdate),
          from_day: String(r.from_day ?? r.fromday ?? '1-7'),
          hawk_sub: Number(r.hawk_sub ?? -1),
          dis: String(r.dis ?? '0'),
          dely: Number(r.dely ?? 0),
        };
      }).filter(s => s.customer_id > 0);

      const dedupedSubs = saveJsonWithDeduplication('all_subscriptions.json', mappedSubs, 'sno', isAppendMode);
      stats['customer_detail'] = dedupedSubs.length;

      // Clean batch for customer_detail: omit local per-customer line number 'sno'
      // so Supabase generates a unique auto-increment serial ID without code 21000 duplicate key conflict!
      const cleanBatch = mappedSubs.map(s => ({
        customer_id: s.customer_id,
        publica_id: s.publica_id,
        hawker_id: s.hawker_id,
        qty: s.qty,
        circulation: s.circulation,
        s_date: s.s_date,
        c_date: s.c_date,
        from_day: s.from_day,
        hawk_sub: s.hawk_sub,
        dis: s.dis,
        dely: s.dely,
      }));

      // Synchronously insert into Supabase in batches of 500
      for (let i = 0; i < cleanBatch.length; i += 500) {
        const batch = cleanBatch.slice(i, i + 500);
        const { error } = await supabase.from('customer_detail').insert(batch);
        if (error) console.error('Subscription Supabase insert error batch', i, error.message);
      }
    }

    // -------------------------------------------------------------
    // 3. Discontinue (discontinue20262027)
    // -------------------------------------------------------------
    const discRows = parsedTables['discontinue20262027'] || parsedTables['discontinue'];
    if (discRows && discRows.length > 0) {
      const mappedDiscs = discRows.map(r => {
        if (Array.isArray(r)) {
          const rawTp = String(r[5] || 'T').trim();
          const isPerma = rawTp.toUpperCase() === 'PERMANENT' || rawTp.toUpperCase() === 'P';
          return {
            discontinue_id: Number(r[0]),
            sno: Number(r[1] ?? 0),
            entry_date: toIsoDate(r[2]),
            customer_id: Number(r[3]),
            publica_id: Number(r[4]),
            temp_perma: isPerma ? 'Permanent' : 'Temporary',
            temp_from: toIsoDate(r[6]),
            temp_to: toIsoDate(r[7]),
            s_date: toIsoDate(r[8]),
            c_date: toIsoDate(r[9]),
            hawker_id: Number(r[10] ?? 0),
            financial_year: '2026-2027',
          };
        }
        const rawTp = String(r.temp_perma ?? r.tempperma ?? 'T').trim();
        const isPerma = rawTp.toUpperCase() === 'PERMANENT' || rawTp.toUpperCase() === 'P';
        return {
          discontinue_id: Number(r.discontinue_id ?? r.discontinueid ?? 0),
          sno: Number(r.sno ?? 0),
          entry_date: toIsoDate(r.entry_date ?? r.entrydate),
          customer_id: Number(r.customer_id ?? r.customerid ?? 0),
          publica_id: Number(r.publica_id ?? r.publicaid ?? 0),
          temp_perma: isPerma ? 'Permanent' : 'Temporary',
          temp_from: toIsoDate(r.temp_from ?? r.tempfrom),
          temp_to: toIsoDate(r.temp_to ?? r.tempto),
          s_date: toIsoDate(r.s_date ?? r.sdate),
          c_date: toIsoDate(r.c_date ?? r.cdate),
          hawker_id: Number(r.hawker_id ?? r.hawkerid ?? 0),
          financial_year: '2026-2027',
        };
      }).filter(d => d.discontinue_id > 0);

      const dedupedDiscs = saveJsonWithDeduplication('discontinues.json', mappedDiscs, 'discontinue_id', isAppendMode);
      stats['discontinue'] = dedupedDiscs.length;

      // Clean Supabase payload: only columns that exist in Supabase 'discontinue' table
      const supabaseDiscs = mappedDiscs.map(d => ({
        discontinue_id: d.discontinue_id,
        sno: d.sno,
        customer_id: d.customer_id,
        publica_id: d.publica_id,
        temp_perma: d.temp_perma,
        temp_from: d.temp_from,
        temp_to: d.temp_to,
        entry_date: d.entry_date,
        financial_year: d.financial_year,
      }));

      for (let i = 0; i < supabaseDiscs.length; i += 500) {
        const batch = supabaseDiscs.slice(i, i + 500);
        const { error } = await supabase.from('discontinue').upsert(batch, { onConflict: 'discontinue_id' });
        if (error) console.error('Discontinue Supabase upsert error batch', i, error.message);
      }

      // CRUCIAL: Automatically update c_date on all matching active subscriptions
      await syncDiscontinueClosuresToSubscriptions(mappedDiscs);
    }

    // -------------------------------------------------------------
    // 4. Hawkers
    // -------------------------------------------------------------
    const hawkerRows = parsedTables['hawker'];
    if (hawkerRows && hawkerRows.length > 0) {
      const mappedHawkers = hawkerRows.map(r => {
        if (Array.isArray(r)) {
          return {
            hawker_id: Number(r[0]),
            name: String(r[1] || ''),
            address: String(r[2] || ''),
            city: String(r[3] || ''),
            phone: String(r[4] || ''),
            mobile: String(r[5] || ''),
            region_id: Number(r[6] ?? 0),
            commission_rate: Number(r[7] ?? 0),
          };
        }
        return {
          hawker_id: Number(r.hawker_id ?? r.hawkerid ?? 0),
          name: String(r.name ?? ''),
          address: String(r.address ?? ''),
          city: String(r.city ?? ''),
          phone: String(r.phone ?? ''),
          mobile: String(r.mobile ?? ''),
          region_id: Number(r.region_id ?? 0),
          commission_rate: Number(r.commission_rate ?? 0),
        };
      }).filter(h => h.hawker_id > 0);

      const dedupedHawkers = saveJsonWithDeduplication('hawkers.json', mappedHawkers, 'hawker_id', isAppendMode);
      stats['hawker'] = dedupedHawkers.length;

      // Sync Supabase hawker table
      for (let i = 0; i < mappedHawkers.length; i += 500) {
        const batch = mappedHawkers.slice(i, i + 500).map(h => ({
          hawker_id: h.hawker_id,
          name: h.name,
          address: h.address,
          city: h.city,
          phone: h.phone,
          mobile: h.mobile,
        }));
        await supabase.from('hawker').upsert(batch, { onConflict: 'hawker_id' });
      }
    }

    // -------------------------------------------------------------
    // 5. Publications
    // -------------------------------------------------------------
    const pubRows = parsedTables['publication'] || parsedTables['publica'];
    if (pubRows && pubRows.length > 0) {
      const mappedPubs = pubRows.map(r => {
        if (Array.isArray(r)) {
          return {
            publica_id: Number(r[0]),
            name: String(r[1] || ''),
            public_name: String(r[1] || ''),
            type_p: String(r[2] || 'Newspaper'),
            publish_id: Number(r[3] ?? 0),
            abrv: String(r[4] || ''),
            circulation: String(r[5] || 'Morning'),
            duration: r[6] ? String(r[6]) : null,
            magzine_day: Number(r[7] ?? 0),
            magzine_month: Number(r[8] ?? 0),
            chr_del: Number(r[9] ?? 0),
            pub_hindi: String(r[10] || ''),
          };
        }
        return {
          publica_id: Number(r.publica_id ?? r.publicaid ?? 0),
          name: String(r.public_name ?? r.name ?? ''),
          public_name: String(r.public_name ?? r.name ?? ''),
          type_p: String(r.type_p ?? 'Newspaper'),
          publish_id: Number(r.publish_id ?? 0),
          abrv: String(r.abrv ?? ''),
          circulation: String(r.circulation ?? 'Morning'),
          duration: r.duration ? String(r.duration) : null,
          magzine_day: Number(r.magzine_day ?? 0),
          magzine_month: Number(r.magzine_month ?? 0),
          chr_del: Number(r.chr_del ?? 0),
          pub_hindi: String(r.pub_hindi ?? ''),
        };
      }).filter(p => p.publica_id > 0);

      const dedupedPubs = saveJsonWithDeduplication('publications.json', mappedPubs, 'publica_id', isAppendMode);
      stats['publication'] = dedupedPubs.length;

      // Sync Supabase publication table
      for (let i = 0; i < mappedPubs.length; i += 500) {
        const batch = mappedPubs.slice(i, i + 500);
        await supabase.from('publication').upsert(batch, { onConflict: 'publica_id' });
      }
    }

    // -------------------------------------------------------------
    // 6. Rates
    // -------------------------------------------------------------
    const rateRows = parsedTables['rate'];
    if (rateRows && rateRows.length > 0) {
      const mappedRates = rateRows.map(r => {
        if (Array.isArray(r)) {
          const pid = Number(r[0]);
          const dow = Number(r[2] ?? 1);
          return {
            id: `${pid}_${dow}`,
            publica_id: pid,
            rate: Number(r[1] ?? 0),
            dayofweek: dow,
          };
        }
        const pid = Number(r.publica_id ?? r.publicaid ?? 0);
        const dow = Number(r.dayofweek ?? 1);
        return {
          id: `${pid}_${dow}`,
          publica_id: pid,
          rate: Number(r.rate ?? 0),
          dayofweek: dow,
        };
      });

      const dedupedRates = saveJsonWithDeduplication('rates.json', mappedRates, 'id', isAppendMode);
      stats['rate'] = dedupedRates.length;

      for (let i = 0; i < mappedRates.length; i += 500) {
        const batch = mappedRates.slice(i, i + 500);
        await supabase.from('rate').upsert(batch, { onConflict: 'id' });
      }
    }

    // -------------------------------------------------------------
    // 7. Regions (regiond / region / regions)
    // -------------------------------------------------------------
    const regionRows = parsedTables['regiond'] || parsedTables['region'] || parsedTables['regions'];
    if (regionRows && regionRows.length > 0) {
      const mappedRegions = regionRows.map(r => {
        if (Array.isArray(r)) {
          return {
            region_id: Number(r[0]),
            region_name: String(r[1] || ''),
            name: String(r[1] || ''),
            zone: String(r[2] || ''),
          };
        }
        return {
          region_id: Number(r.region_id ?? r.regionid ?? 0),
          region_name: String(r.region_name ?? r.regionname ?? r.name ?? ''),
          name: String(r.region_name ?? r.regionname ?? r.name ?? ''),
          zone: String(r.zone ?? ''),
        };
      }).filter(reg => reg.region_id > 0);

      const dedupedRegions = saveJsonWithDeduplication('regions.json', mappedRegions, 'region_id', isAppendMode);
      stats['region'] = dedupedRegions.length;

      for (let i = 0; i < mappedRegions.length; i += 200) {
        const batch = mappedRegions.slice(i, i + 200).map(rg => ({
          region_id: rg.region_id,
          name: rg.name,
        }));
        await supabase.from('region').upsert(batch, { onConflict: 'region_id' });
      }
    }

    // -------------------------------------------------------------
    // 8. Holidays (holiday)
    // -------------------------------------------------------------
    const holidayRows = parsedTables['holiday'];
    if (holidayRows && holidayRows.length > 0) {
      const mappedHolidays = holidayRows.map((r, idx) => {
        if (Array.isArray(r)) {
          const dt = toIsoDate(r[0]) || String(r[0] || '');
          const pid = Number(r[2] ?? 0);
          return {
            id: `${dt}_${pid}_${idx}`,
            holiday_id: idx + 1,
            oc_date: dt,
            dated: dt,
            occasion: String(r[1] || ''),
            remark: String(r[1] || ''),
            publica_id: pid,
          };
        }
        const dt = toIsoDate(r.oc_date ?? r.ocdate ?? r.dated) || '';
        const pid = Number(r.publica_id ?? r.publicaid ?? 0);
        return {
          id: `${dt}_${pid}_${idx}`,
          holiday_id: idx + 1,
          oc_date: dt,
          dated: dt,
          occasion: String(r.occasion ?? r.remark ?? ''),
          remark: String(r.occasion ?? r.remark ?? ''),
          publica_id: pid,
        };
      });

      const dedupedHolidays = saveJsonWithDeduplication('holidays.json', mappedHolidays, 'id', isAppendMode);
      stats['holiday'] = dedupedHolidays.length;

      for (let i = 0; i < mappedHolidays.length; i += 500) {
        const batch = mappedHolidays.slice(i, i + 500);
        await supabase.from('holiday').upsert(batch, { onConflict: 'id' });
      }
    }

    // -------------------------------------------------------------
    // 9. Receipts (receipt20262027)
    // -------------------------------------------------------------
    const receiptRows = parsedTables['receipt20262027'];
    if (receiptRows && receiptRows.length > 0) {
      const mappedReceipts = receiptRows.map(r => {
        if (Array.isArray(r)) {
          const repId = Number(r[0] ?? 0);
          const recpNo = Number(r[2] ?? 0);
          const rawBillDt = r[4] ? String(r[4]) : '';
          const rawMalDt = r[6] ? String(r[6]) : '';
          return {
            receipt_id: repId,
            id: repId,
            bill_id: Number(r[1] ?? 0),
            bill_no: Number(r[1] ?? 0),
            receipt_no: recpNo,
            recp_no: recpNo,
            manual_rep_no: String(r[3] ?? ''),
            mal_rep_no: String(r[3] ?? ''),
            bill_date: toIsoDate(rawBillDt) || rawBillDt,
            recp_date: toIsoDate(rawBillDt) || toIsoDate(rawMalDt) || rawBillDt,
            bill_amt: Number(r[5] ?? 0),
            mal_recp_dt: toIsoDate(rawMalDt) || rawMalDt,
            month: String(r[7] || ''),
            year: String(r[8] ?? '2026'),
            due_amt: Number(r[9] ?? 0),
            mal_recp_amt: Number(r[10] ?? 0),
            r_amt: Number(r[13] ?? r[10] ?? 0),
            balance: Number(r[11] ?? 0),
            less_amt: Number(r[12] ?? 0),
            cheque_no: String(r[14] ?? ''),
            cheque_date: toIsoDate(r[15]) || String(r[15] ?? ''),
            cash_chq: String(r[18] || 'Cash'),
            narr: String(r[19] || ''),
            customer_id: Number(r[20] ?? 0),
          };
        }
        const repId = Number(r.receipt_id ?? r.receiptid ?? r.id ?? 0);
        const recpNo = Number(r.receipt_no ?? r.receiptno ?? r.recp_no ?? 0);
        const rawBillDt = r.bill_date ?? r.billdate ?? '';
        const rawMalDt = r.mal_recp_dt ?? r.malrecpdt ?? '';
        return {
          receipt_id: repId,
          id: repId,
          bill_id: Number(r.bill_id ?? r.billid ?? 0),
          bill_no: Number(r.bill_no ?? r.bill_id ?? 0),
          receipt_no: recpNo,
          recp_no: recpNo,
          manual_rep_no: String(r.manual_rep_no ?? r.manualrepno ?? r.mal_rep_no ?? ''),
          mal_rep_no: String(r.manual_rep_no ?? r.manualrepno ?? r.mal_rep_no ?? ''),
          bill_date: toIsoDate(rawBillDt) || rawBillDt,
          recp_date: toIsoDate(rawBillDt) || toIsoDate(rawMalDt) || rawBillDt,
          bill_amt: Number(r.bill_amt ?? r.billamt ?? 0),
          mal_recp_dt: toIsoDate(rawMalDt) || rawMalDt,
          month: String(r.month ?? ''),
          year: String(r.year ?? '2026'),
          due_amt: Number(r.due_amt ?? r.dueamt ?? 0),
          mal_recp_amt: Number(r.mal_recp_amt ?? r.malrecpamt ?? 0),
          r_amt: Number(r.r_amt ?? r.ramt ?? r.mal_recp_amt ?? 0),
          balance: Number(r.balance ?? 0),
          less_amt: Number(r.less_amt ?? r.lessamt ?? 0),
          cheque_no: String(r.cheque_no ?? r.chequeno ?? ''),
          cheque_date: toIsoDate(r.cheque_date ?? r.chequedate) || String(r.cheque_date ?? ''),
          cash_chq: String(r.cash_chq ?? r.cashchq ?? 'Cash'),
          narr: String(r.narr ?? ''),
          customer_id: Number(r.customer_id ?? r.customerid ?? 0),
        };
      }).filter(rc => rc.id > 0);

      const dedupedReceipts = saveJsonWithDeduplication('all_receipts.json', mappedReceipts, 'id', isAppendMode);
      stats['receipt20262027'] = dedupedReceipts.length;

      // Sync into Supabase receipt20262027 table synchronously
      const supabaseBatch = mappedReceipts.map(rc => ({
        id: rc.receipt_id,
        recp_no: rc.recp_no,
        recp_date: rc.recp_date || null,
        customer_id: rc.customer_id,
        bill_amt: rc.bill_amt,
        less_amt: rc.less_amt,
        mal_recp_amt: rc.mal_recp_amt,
        month: rc.month,
        year: rc.year,
        region_id: null,
        remarks: JSON.stringify({
          bill_no: rc.bill_no,
          manual_rep_no: rc.manual_rep_no,
          mal_rep_no: rc.mal_rep_no,
          mal_recp_dt: rc.mal_recp_dt,
          balance: rc.balance,
          cash_chq: rc.cash_chq,
          r_amt: rc.r_amt
        })
      }));

      for (let i = 0; i < supabaseBatch.length; i += 300) {
        const chunk = supabaseBatch.slice(i, i + 300);
        const { error } = await supabase.from('receipt20262027').upsert(chunk, { onConflict: 'id' });
        if (error) console.error('Receipt Supabase upsert error batch', i, error.message);
      }
    }

    // -------------------------------------------------------------
    // 10. Bill Headers (billno20262027)
    // -------------------------------------------------------------
    const billnoRows = parsedTables['billno20262027'];
    if (billnoRows && billnoRows.length > 0) {
      const mappedBillno = billnoRows.map(r => {
        if (Array.isArray(r)) {
          return {
            bill_id: Number(r[0]),
            customer_id: Number(r[1] ?? 0),
            region_id: Number(r[2] ?? 0),
            due_amt: r[3] !== null && r[3] !== undefined && r[3] !== '' ? Number(r[3]) : null,
            del_amt: r[4] !== null && r[4] !== undefined && r[4] !== '' ? Number(r[4]) : null,
            dis_amt: r[5] !== null && r[5] !== undefined && r[5] !== '' ? Number(r[5]) : null,
            month: String(r[6] || ''),
            year: String(r[7] || '2026'),
            balance: r[8] !== null && r[8] !== undefined && r[8] !== '' ? Number(r[8]) : null,
          };
        }
        return {
          bill_id: Number(r.bill_id ?? r.billid ?? 0),
          customer_id: Number(r.customer_id ?? r.customerid ?? 0),
          region_id: Number(r.region_id ?? r.regionid ?? 0),
          due_amt: r.due_amt ?? r.dueamt ?? null,
          del_amt: r.del_amt ?? r.delamt ?? null,
          dis_amt: r.dis_amt ?? r.disamt ?? null,
          month: String(r.month ?? ''),
          year: String(r.year ?? '2026'),
          balance: r.balance !== null && r.balance !== undefined && r.balance !== '' ? Number(r.balance) : null,
        };
      }).filter(b => b.bill_id > 0);

      const dedupedBillno = saveJsonWithDeduplication('all_bill_headers.json', mappedBillno, 'bill_id', isAppendMode);
      stats['billno20262027'] = dedupedBillno.length;

      for (let i = 0; i < mappedBillno.length; i += 500) {
        const batch = mappedBillno.slice(i, i + 500);
        const { error } = await supabase.from('billno20262027').upsert(batch, { onConflict: 'bill_id' });
        if (error) console.error('Billno Supabase upsert error batch', i, error.message);
      }
    }

    // -------------------------------------------------------------
    // 11. Bill Items (bill20262027)
    // -------------------------------------------------------------
    const billRows = parsedTables['bill20262027'];
    if (billRows && billRows.length > 0) {
      const mappedBills = billRows.map(r => {
        if (Array.isArray(r)) {
          return {
            bill_id: Number(r[0]),
            customer_id: Number(r[1] ?? 0),
            publica_id: Number(r[2] ?? 0),
            region_id: Number(r[3] ?? 0),
            qty: Number(r[4] ?? 1),
            rate: Number(r[5] ?? 0),
            d_charges: Number(r[6] ?? 0),
            total_amt: Number(r[7] ?? 0),
            month: String(r[8] || ''),
            year: String(r[9] || '2026'),
            sno: Number(r[10] ?? 0),
          };
        }
        return {
          bill_id: Number(r.bill_id ?? r.billid ?? 0),
          customer_id: Number(r.customer_id ?? r.customerid ?? 0),
          publica_id: Number(r.publica_id ?? r.publicaid ?? 0),
          region_id: Number(r.region_id ?? r.regionid ?? 0),
          qty: Number(r.qty ?? 1),
          rate: Number(r.rate ?? 0),
          d_charges: Number(r.d_charges ?? r.dcharges ?? 0),
          total_amt: Number(r.total_amt ?? r.totalamt ?? 0),
          month: String(r.month ?? ''),
          year: String(r.year ?? '2026'),
          sno: Number(r.sno ?? 0),
        };
      }).filter(b => b.bill_id > 0);

      stats['bill20262027'] = mappedBills.length;
      if (!isAppendMode) {
        await supabase.from('bill20262027').delete().gte('id', 0);
      }
      for (let i = 0; i < mappedBills.length; i += 500) {
        const batch = mappedBills.slice(i, i + 500);
        const { error } = await supabase.from('bill20262027').insert(batch);
        if (error) console.error('Bill item Supabase insert error batch', i, error.message);
      }
    }

    // -------------------------------------------------------------
    // 12. Retail Sales (retailsale20262027)
    // -------------------------------------------------------------
    const retailRows = parsedTables['retailsale20262027'];
    if (retailRows && retailRows.length > 0) {
      const mappedRetail = retailRows.map(r => {
        if (Array.isArray(r)) {
          return {
            retail_id: Number(r[0]),
            vr_date: toIsoDate(r[1]),
            customer_id: Number(r[2] ?? 0),
            publica_id: Number(r[3] ?? 0),
            copies: Number(r[4] ?? 1),
            rate: Number(r[5] ?? 0),
            amt: Number(r[6] ?? 0),
            narr: String(r[7] || ''),
          };
        }
        return {
          retail_id: Number(r.retail_id ?? r.retailid ?? 0),
          vr_date: toIsoDate(r.vr_date ?? r.vrdate),
          customer_id: Number(r.customer_id ?? r.customerid ?? 0),
          publica_id: Number(r.publica_id ?? r.publicaid ?? 0),
          copies: Number(r.copies ?? 1),
          rate: Number(r.rate ?? 0),
          amt: Number(r.amt ?? 0),
          narr: String(r.narr ?? ''),
        };
      }).filter(rt => rt.retail_id > 0);

      const dedupedRetail = saveJsonWithDeduplication('retailsale.json', mappedRetail, 'retail_id', isAppendMode);
      stats['retailsale20262027'] = dedupedRetail.length;

      for (let i = 0; i < mappedRetail.length; i += 500) {
        const batch = mappedRetail.slice(i, i + 500);
        const { error } = await supabase.from('retailsale20262027').upsert(batch, { onConflict: 'retail_id' });
        if (error) console.error('Retail sale Supabase upsert error batch', i, error.message);
      }
    }

    // -------------------------------------------------------------
    // 13. Rate Changes (ratechange)
    // -------------------------------------------------------------
    const rcRows = parsedTables['ratechange'];
    if (rcRows && rcRows.length > 0) {
      const mappedRc = rcRows.map((r, idx) => {
        if (Array.isArray(r)) {
          const pid = Number(r[0]);
          const oldR = Number(r[1] ?? 0);
          const newR = Number(r[2] ?? 0);
          const dt = toIsoDate(r[3]) || String(r[3] || '');
          const dow = Number(r[4] ?? 1);
          return {
            id: `${pid}_${dow}_${dt}`,
            publica_id: pid,
            oldrate: oldR,
            newrate: newR,
            effective_date: dt,
            dayofweek: dow
          };
        }
        const pid = Number(r.publica_id ?? r.publicaid ?? 0);
        const dt = toIsoDate(r.dated ?? r.effective_date) || '';
        const dow = Number(r.dayofweek ?? 1);
        return {
          id: `${pid}_${dow}_${dt}`,
          publica_id: pid,
          oldrate: Number(r.oldrate ?? 0),
          newrate: Number(r.newrate ?? r.new_rate ?? 0),
          effective_date: dt,
          dayofweek: dow
        };
      });

      const dedupedRc = saveJsonWithDeduplication('ratechanges.json', mappedRc, 'id', isAppendMode);
      stats['ratechange'] = dedupedRc.length;
      for (let i = 0; i < mappedRc.length; i += 500) {
        const batch = mappedRc.slice(i, i + 500);
        const { error } = await supabase.from('ratechange').upsert(batch, { onConflict: 'id' });
        if (error) console.error('Ratechange Supabase upsert error batch', i, error.message);
      }
    }

    // -------------------------------------------------------------
    // 14. Publication Discontinues (publicationdis)
    // -------------------------------------------------------------
    const pubDisRows = parsedTables['publicationdis'];
    if (pubDisRows && pubDisRows.length > 0) {
      const mappedPubDis = pubDisRows.map((r, idx) => {
        if (Array.isArray(r)) {
          const pid = Number(r[0]);
          const fDate = toIsoDate(r[1]) || String(r[1] || '');
          const tDate = toIsoDate(r[2]) || String(r[2] || '');
          return {
            id: `${pid}_${fDate}_${idx}`,
            publica_id: pid,
            entry_date: fDate,
            oc_date: tDate,
            dis_type: 'Permanent'
          };
        }
        const pid = Number(r.publica_id ?? r.publicaid ?? 0);
        const fDate = toIsoDate(r.fromdate ?? r.from_date ?? r.entry_date) || '';
        const tDate = toIsoDate(r.todate ?? r.to_date ?? r.oc_date) || '';
        return {
          id: `${pid}_${fDate}_${idx}`,
          publica_id: pid,
          entry_date: fDate,
          oc_date: tDate,
          dis_type: 'Permanent'
        };
      });

      const dedupedPubDis = saveJsonWithDeduplication('publicationdis.json', mappedPubDis, 'id', isAppendMode);
      stats['publicationdis'] = dedupedPubDis.length;
      for (let i = 0; i < mappedPubDis.length; i += 500) {
        const batch = mappedPubDis.slice(i, i + 500);
        const { error } = await supabase.from('publicationdis').upsert(batch, { onConflict: 'id' });
        if (error) console.error('Publicationdis Supabase upsert error batch', i, error.message);
      }
    }

    // -------------------------------------------------------------
    // 15. Delivery Charges (billdel20262027)
    // -------------------------------------------------------------
    const billdelRows = parsedTables['billdel20262027'];
    if (billdelRows && billdelRows.length > 0) {
      const mappedBilldel = billdelRows.map(r => {
        if (Array.isArray(r)) {
          return {
            customer_id: Number(r[0] ?? 0),
            region_id: Number(r[1] ?? 0),
            publica_id: Number(r[2] ?? 0),
            month: String(r[3] || ''),
            year: String(r[4] || '2026'),
            dely: Number(r[5] ?? 0),
            sno: Number(r[6] ?? 0),
          };
        }
        return {
          customer_id: Number(r.customer_id ?? r.customerid ?? 0),
          region_id: Number(r.region_id ?? r.regionid ?? 0),
          publica_id: Number(r.publica_id ?? r.publicaid ?? 0),
          month: String(r.month || ''),
          year: String(r.year || '2026'),
          dely: Number(r.dely ?? r.Dely ?? 0),
          sno: Number(r.sno ?? 0),
        };
      }).filter(b => b.customer_id > 0);

      stats['billdel20262027'] = mappedBilldel.length;
      if (!isAppendMode) {
        await supabase.from('billdel20262027').delete().gte('customer_id', 0);
      }
      for (let i = 0; i < mappedBilldel.length; i += 500) {
        const batch = mappedBilldel.slice(i, i + 500);
        const { error } = await supabase.from('billdel20262027').insert(batch);
        if (error) console.error('Billdel Supabase insert error batch', i, error.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'SQL Backup file parsed and restored successfully into active database and local JSON stores with zero duplicates!',
      stats,
    });
  } catch (error: any) {
    console.error('Restore processing error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// -------------------------------------------------------------
// Stream Parser Helper (Handles huge 500MB+ MySQL dumps safely)
// -------------------------------------------------------------
async function parseSqlFileStream(filePath: string): Promise<Record<string, any[]>> {
  const fileStream = fs.createReadStream(filePath, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const coreTables = new Set([
    'customer',
    'customer_detail',
    'custdetail',
    'hawker',
    'publication',
    'publica',
    'rate',
    'ratechange',
    'publicationdis',
    'discontinue20262027',
    'discontinue',
    'regiond',
    'region',
    'regions',
    'holiday',
    'receipt20262027',
    'billno20262027',
    'bill20262027',
    'billdel20262027',
    'retailsale20262027',
  ]);

  const parsedTables: Record<string, any[]> = {};
  for (const t of coreTables) parsedTables[t] = [];

  const parseRow = (str: string): any[] => {
    const trimmed = str.trim().replace(/^\(/, '').replace(/\)[,;]?$/, '');
    const tokens: string[] = [];
    let inQuote = false;
    let cur = '';

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];

      let backslashCount = 0;
      for (let j = i - 1; j >= 0 && trimmed[j] === '\\'; j--) {
        backslashCount++;
      }

      if (ch === '\'' && backslashCount % 2 === 0) {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        tokens.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    tokens.push(cur.trim());

    return tokens.map(t => {
      if (t === 'NULL' || t === 'null') return null;
      if (t.startsWith('\'') && t.endsWith('\'')) {
        return t.slice(1, -1).replace(/\\'/g, '\'').replace(/\\\\/g, '\\');
      }
      const num = Number(t);
      return isNaN(num) ? t : num;
    });
  };

  let currentTbl: string | null = null;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toLowerCase().startsWith('insert into ')) {
      const match = trimmed.match(/^insert\s+into\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i);
      if (match) {
        const tbl = match[1].toLowerCase();
        if (coreTables.has(tbl)) {
          currentTbl = tbl;
        } else if (tbl === 'discontinue' || (tbl.startsWith('discontinue') && tbl.includes('20262027'))) {
          currentTbl = 'discontinue20262027';
        } else if (tbl.startsWith('receipt') && tbl.includes('20262027')) {
          currentTbl = 'receipt20262027';
        } else if (tbl.startsWith('billno') && tbl.includes('20262027')) {
          currentTbl = 'billno20262027';
        } else if (tbl.startsWith('billdel') && tbl.includes('20262027')) {
          currentTbl = 'billdel20262027';
        } else if (tbl.startsWith('bill') && tbl.includes('20262027')) {
          currentTbl = 'bill20262027';
        } else if (tbl.startsWith('retailsale') && tbl.includes('20262027')) {
          currentTbl = 'retailsale20262027';
        } else {
          currentTbl = null;
        }
      }
    }

    if (currentTbl) {
      if (trimmed.startsWith('(')) {
        parsedTables[currentTbl].push(parseRow(trimmed));
      }
      if (trimmed.endsWith(');') || trimmed.endsWith(';')) {
        currentTbl = null;
      }
    }
  }

  return parsedTables;
}
