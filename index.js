// index.js
const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');

const app = express();

// LINE Bot設定
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// Google Sheets API用のJWT認証（"シフト検索"用 - Base64対応）
async function getUserShiftData(userId) {
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString()
  );

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = process.env.SPREADSHEET_ID;
  const range = 'テストシフト_企画_読み取り用_一日目!A3:F';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: range,
  });
  const values = res.data.values || [];

  const now = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const nowStr = now.toTimeString().slice(0, 5); // "HH:mm"

  const matched = values.filter(row => {
    const rowUserId = row[2];
    const timeStr = row[3];
    return (
      rowUserId === userId &&
      typeof timeStr === 'string' &&
      timeStr >= nowStr
    );
  });

  if (matched.length === 0) return [];

  return matched.map(row => {
    const time = row[3] || '時間不明';
    const place = row[5] || '場所不明';
    const club = row[4] || '';
    return `・${time} @ ${place}（${club}）`;
  });
}

// Google Sheets API（マスターデータ記録用）
const sheetsAuth = new google.auth.GoogleAuth({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString()),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'マスターデータ';

// Webhookエンドポイント
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    // 新規友だち登録
    if (event.type === 'follow') {
      const userId = event.source.userId;
      try {
        const profile = await client.getProfile(userId);
        const name = profile.displayName;

        const sheetData = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!C2:C`,
        });
        const existingIds = (sheetData.data.values || []).flat();
        if (existingIds.includes(userId)) continue;

        const now = new Date();
        const datetime = now.toLocaleString('ja-JP');

        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A2`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [[datetime, name, userId]]
          }
        });
      } catch (err) {
        console.error('登録時エラー:', err);
      }
    }

    // テキストメッセージ受信
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text;
      const userId = event.source.userId;

      if (text.trim() === 'シフト検索') {
        try {
          const profile = await client.getProfile(userId);
          const name = profile.displayName;
      
          const shifts = await getUserShiftData(userId);
          const header = `【${name}さんのこれからのシフト】`;
          const body = shifts.length > 0
            ? shifts.join('\n')
            : '現在以降のシフトが登録されていません。';
      
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `${header}\n${body}`
          });
        } catch (err) {
          console.error('シフト検索中のエラー:', err);
        }
      }
    }
  }

  res.status(200).send('OK');
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhookサーバー起動中！ポート: ${PORT}`);
});
