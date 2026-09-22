const fs = require('fs');
const path = require('path');

// 1. Sync Hawkers from 4hawkeer.csv
const rawHawkers = fs.readFileSync('B:/himanshu uncle/Rahul/4hawkeer.csv', 'utf8');
const hawkerRows = rawHawkers.split('\n').filter(r => r.trim());
const hawkerList = [];

for (let i = 1; i < hawkerRows.length; i++) {
  const line = hawkerRows[i].trim();
  if (!line) continue;
  // Parse CSV line handling quotes
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
  const id = parseInt(parts[0]);
  if (isNaN(id)) continue;
  const name = parts[1] || '';
  hawkerList.push({
    hawker_id: id,
    name: name,
    hawker_name: name,
    address: parts[2] || '',
    city: parts[3] || '',
    phone: parts[4] || '',
    mobile: parts[5] || '',
    region_id: parseInt(parts[6]) || 1
  });
}

fs.writeFileSync('public/data/hawkers.json', JSON.stringify(hawkerList, null, 2));
console.log('Hawkers updated successfully:', hawkerList.length, 'sample:', hawkerList.slice(0, 3));
