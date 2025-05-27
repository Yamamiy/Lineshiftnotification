const { sheets, SPREADSHEET_ID } = require('./sheetService');

// ✅ ユーザー名取得（マスターデータから）
async function getUserNameFromMaster(userId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'マスターデータ!B2:C',
  });

  const rows = response.data.values || [];
  for (const row of rows) {
    if (row[1] === userId) return row[0];
  }
  return '不明';
}

// ✅ シフトデータ取得
async function getUserShiftData(userId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!B3:G`
  });

  const values = response.data.values || [];
  const now = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const nowStr = now.toTimeString().slice(0, 5);

  const filtered = values
    .filter(row => row[1] === userId && typeof row[2] === 'string' && row[2] >= nowStr)
    .sort((a, b) => a[2].localeCompare(b[2]))
    .slice(0, 3);

  const nameFromSheet = filtered.length > 0 ? filtered[0][0] : 'UNKNOWN';
  const data = filtered.map(row => ({
    's-time': row[2] || '??:??',
    'e-time': row[3] || '??:??',
    'club': row[4] || '??',
    'point': row[5] || '??'
  }));

  return { nameFromSheet, data };
}

// ✅ テンプレートの穴埋め
function fillTemplate(templateLines, name, shifts) {
  const joined = templateLines.join('\n');
  let filled = joined.replace(/\{name\}/g, name);

  const safe = (value, fallback = '-') => {
    return (value && value.trim() !== '') ? value : fallback;
  };

  if (shifts.length === 0) {
    filled = filled.replace(/\{point\d+\}/g, 'これからのシフトはありません');
    filled = filled.replace(/\{s-time\d+\}/g, '-');
    filled = filled.replace(/\{e-time\d+\}/g, '-');
    filled = filled.replace(/\{club\d+\}/g, '-');
  } else {
    for (let i = 0; i < 3; i++) {
      const d = shifts[i] || { 's-time': '', 'e-time': '', 'club': '', 'point': '' };
      filled = filled
        .replace(new RegExp(`\\{s-time${i + 1}\\}`, 'g'), safe(d['s-time']))
        .replace(new RegExp(`\\{e-time${i + 1}\\}`, 'g'), safe(d['e-time']))
        .replace(new RegExp(`\\{club${i + 1}\\}`, 'g'), safe(d['club'], ''))
        .replace(new RegExp(`\\{point${i + 1}\\}`, 'g'), safe(d['point'], '以降のシフトはありません'));
    }
  }

  return filled;
}

module.exports = {
  getUserNameFromMaster,
  getUserShiftData,
  fillTemplate
};
