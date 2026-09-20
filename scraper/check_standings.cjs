const fs = require('fs');
const html = fs.readFileSync('C:/work/nyhl/app/scraper/debug_standings.html', 'utf8');
// Find all rows in the repeater table
const tableMatch = html.match(/id="st_tblRepeater"[\s\S]*?<\/table>/);
if (!tableMatch) { console.log('no table'); process.exit(1); }
const table = tableMatch[0];
const rows = table.match(/<tr[\s\S]*?<\/tr>/g) || [];
rows.forEach((r, i) => {
  const aMatch = r.match(/data="([^"]*?)"/g);
  if (aMatch) console.log('Row', i, ':', aMatch.join(' | '));
});
console.log('Total data rows:', rows.filter(r => r.includes('data=')).length);
