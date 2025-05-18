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
    range: `${sheetName}!A3:F`
  });

  const values = res.data.values || [];
  const now = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const nowStr = now.toTimeString().slice(0, 5);

  return values
    .filter(row => row[1] === userId && typeof row[2] === 'string' && row[2] >= nowStr)
    .sort((a, b) => a[2].localeCompare(b[2]))
    .slice(0, 3)
    .map(row => ({
      's-time': row[2] || '??:??',
      'e-time': row[3] || '??:??',
      'club': row[4] || '??',
      'point': row[5] || '??'
    }));
}

function fillTemplate(template, replacements) {
  let filled = template;
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    filled = filled.replace(regex, value);
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

      if (text === '企画部:シフト検索') sheetName = 'テストシフト_企画_読み取り用_一日目';
      else if (text === '総務部:シフト検索') sheetName = 'テストシフト_総務_読み取り用_一日目';
      else continue;

      try {
        const profile = await client.getProfile(userId);
        const name = profile.displayName;
        const shiftData = await getUserShiftData(userId, sheetName);

        if (shiftData.length === 0) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `${name}さんのこれからのシフトは登録されていません。`
          });
          return;
        }

        const templateRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: '本文!E3'
        });
        const baseTemplate = templateRes.data.values?.[0]?.[0];

        if (!baseTemplate) throw new Error('テンプレートが見つかりません');

        let filled = baseTemplate.replace('{name}', name);
        for (let i = 0; i < 3; i++) {
          const data = shiftData[i] || { 's-time': '', 'e-time': '', 'club': '', 'point': '' };
          for (const [key, val] of Object.entries(data)) {
            filled = filled.replace(new RegExp(`\\{${key}${i + 1}\\}`, 'g'), val);
          }
        }

        await client.replyMessage(event.replyToken, {
          type: 'flex',
          altText: `${name}さんのこれからのシフト`,
          contents: JSON.parse(filled)
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
