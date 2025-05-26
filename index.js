const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const app = express();

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

const sheetsAuth = new google.auth.GoogleAuth({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString()),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'マスターデータ';

async function getUserShiftData(userId, sheetName) {
  const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString());
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );
  const sheetsReadonly = google.sheets({ version: 'v4', auth });

  const res = await sheetsReadonly.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!B3:G`
  });

  const values = res.data.values || [];
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

function fillTemplate(templateLines, name, shifts) {
  const joined = templateLines.join('\n');
  let filled = joined.replace(/\{name\}/g, name);

  if (shifts.length === 0) {
    filled = filled.replace(/\{point\d+\}/g, 'これからのシフトはありません');
    filled = filled.replace(/\{s-time\d+\}/g, '');
    filled = filled.replace(/\{e-time\d+\}/g, '');
    filled = filled.replace(/\{club\d+\}/g, '');
  } else {
    for (let i = 0; i < 3; i++) {
      const d = shifts[i] || { 's-time': '', 'e-time': '', 'club': '', 'point': '' };
      filled = filled
        .replace(new RegExp(`\{s-time${i + 1}\}`, 'g'), d['s-time'])
        .replace(new RegExp(`\{e-time${i + 1}\}`, 'g'), d['e-time'])
        .replace(new RegExp(`\{club${i + 1}\}`, 'g'), d['club'])
        .replace(new RegExp(`\{point${i + 1}\}`, 'g'), d['point']);
    }
  }

  return filled;
}

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    const userId = event.source.userId;

    if (event.type === 'follow') {
      try {
        const profile = await client.getProfile(userId);
        const name = profile.displayName;

        const sheetData = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!C2:C`,
        });
        const existingIds = (sheetData.data.values || []).flat();
        if (existingIds.includes(userId)) continue;

        const datetime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A2`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [[datetime, '', userId, name]]
          }
        });
      } catch (err) {
        console.error('登録時エラー:', err);
      }
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      let sheetName = '';

      if (text === '企画部:シフト検索') sheetName = '幹部テスト2025/05/27';
      else if (text === '総務部:シフト検索') sheetName = '幹部テスト2025/05/26';
      else continue;

      try {
        const { nameFromSheet, data: shiftData } = await getUserShiftData(userId, sheetName);

        const [altTextRes, flexRes, noShiftRes] = await Promise.all([
          sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '本文!E2' }),
          sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '本文!E3' }),
          sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '本文!E4' })
        ]);

        let altTextRaw = altTextRes.data.values?.[0]?.[0] || '{name}さんのこれからのシフト';
        altTextRaw = altTextRaw.replace(/\{name\}/g, nameFromSheet);

        if (shiftData.length === 0) {
          const noShiftMsg = (noShiftRes.data.values?.[0]?.[0] || '{name}さんのこれからのシフトは登録されていません。').replace(/\{name\}/g, nameFromSheet);
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: noShiftMsg
          });
          return;
        }

        const templateString = flexRes.data.values?.[0]?.[0] || '';
        const filledJson = fillTemplate([templateString], nameFromSheet, shiftData);

        await client.replyMessage(event.replyToken, {
          type: 'flex',
          altText: altTextRaw,
          contents: JSON.parse(filledJson)
        });
      } catch (err) {
        console.error('シフト検索中のエラー:', err);
      }
    }
  }

  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhookサーバー起動中！ポート: ${PORT}`);
});
