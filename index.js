const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const app = express();

// 🔐 LINE設定
const config = {
  channelAccessToken: 'HWeFvnnzIm4ZvVxZC3/ev9h+Qt1/ndCPfT1icu2aVsCRQGCHmzGmrLyUPhOWgT6LYzoLM8/vO2glEAhug21tnUsufZZnQ2cK31+EWiW+IsMn82JcKKEuQbppqoZ6nK0kF/9hvm3obYfQO4qtbylyHgdB04t89/1O/w1cDnyilFU=',
  channelSecret: '4e63465c631f1d2e2472282bf1aa83b8'
};
const client = new line.Client(config);

// 🟢 Google Sheets設定
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

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

        // 重複チェック（ユーザーIDの列）
        const sheetData = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!C2:C`, // C列 = ユーザーID
        });
        const existingIds = (sheetData.data.values || []).flat();
        if (existingIds.includes(userId)) {
          console.log(`すでに登録済み`);
          continue;
        }

        // タイムスタンプを含めて記録（A列に日時, B列にユーザー名, C列にユーザーID）
        const now = new Date();
        const datetime = now.toLocaleString('ja-JP'); // 例: 2025/05/10 19:32:00

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
        console.error('エラー:', err);
      }
    }
  }

  res.status(200).send('OK');
});

// 🌐 Webサーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhookサーバー起動中！ ポート: ${PORT}`);
});
