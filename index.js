const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const app = express();

// LINE設定
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};
const client = new line.Client(config);

// Google Sheets設定（Base64からJSONに変換）
const serviceAccount = JSON.parse(
  Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString('utf8')
);

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// 以下に続くコード（Webhook処理、listen）は今までと同じでOK
const SPREADSHEET_ID = '1eeKD2M6-TLZ9DbawroocxSSSvGQKAXuPxUktHPUv004';
const SHEET_NAME = 'マスターデータ';

// 📨 LINE Webhook（署名検証付き！）
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'follow') {
      const userId = event.source.userId;

      try {
        const profile = await client.getProfile(userId);
        const name = profile.displayName;

        console.log(`新規登録: ${name} (${userId})`);

        // 重複チェック（B列: ユーザーID）
        const sheetData = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!B2:B`,
        });
        const existingIds = (sheetData.data.values || []).flat();
        if (existingIds.includes(userId)) {
          console.log(`すでに登録済み`);
          continue;
        }

        // 登録処理（ユーザーID: B列, ユーザー名: C列）
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A2`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [[ '', userId, name ]]  // ← A列空欄 → B列ID → C列名前
          }
        });

      } catch (err) {
        console.error('エラー:', err);
      }
    }
  }

  res.status(200).send('OK');
});

// Render対応のポート設定
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhookサーバー起動中！ ポート: ${PORT}`);
});
