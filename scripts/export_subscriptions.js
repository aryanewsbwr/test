const fs = require('fs');

const raw = fs.readFileSync('B:/himanshu uncle/Rahul/5.2cust info.csv', 'utf8');
const lines = raw.split('\n').filter(l => l.trim());
const list = [];

function safeFloat(v) {
  if (!v) return 0;
  const n = parseFloat(v.replace(/\"/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function safeInt(v) {
  if (!v) return 0;
  const n = parseInt(v.replace(/\"/g, '').trim(), 10);
  return isNaN(n) ? 0 : n;
}

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = [];
  let inQuotes = false;
  let current = '';
  for (let c = 0; c < line.length; c++) {
    const ch = line[c];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  const cid = safeInt(parts[1]);
  const pid = safeInt(parts[2]);
  if (!cid || !pid) continue;

  list.push({
    sno: safeInt(parts[0]),
    customer_id: cid,
    publica_id: pid,
    hawker_id: safeInt(parts[3]) || 1,
    qty: safeInt(parts[4]) || 1,
    circulation: parts[5] || 'Morning',
    s_date: parts[6] || '',
    c_date: parts[7] || null,
    from_day: parts[8] || '1-7',
    dely: safeFloat(parts[11]),
    dis: safeFloat(parts[10])
  });
}

fs.writeFileSync('public/data/all_subscriptions.json', JSON.stringify(list));
console.log('Exported all_subscriptions.json successfully:', list.length, 'records');
