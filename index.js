const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const app = express();

async function getUserShiftData(userId) {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.SHEET_ID;
  const range = 'テストシフト_企画_読み取り用_一日目!A3:F';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: range,
  });

  const values = res.data.values || [];

  const now = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const nowStr = now.toTimeString().slice(0, 5); // "HH:mm"

  const matched = values.filter(row => {
    const rowUserId = row[2]; // C列
    const timeStr = row[3];   // D列

    return (
      rowUserId === userId &&
      typeof timeStr === 'string' &&
      timeStr >= nowStr
    );
  });

  if (matched.length === 0) return [];

  const result = matched.map(row => {
    const time = row[3] || '時間不明';
    const place = row[5] || '場所不明';
    const club = row[4] || '';
    return `・${time} @ ${place}（${club}）`;
  });

  return result;
}


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
  if (event.type === 'message' && event.message.type === 'text') {
  const text = event.message.text;
  const userId = event.source.userId;

  if (text === 'シフト検索') {
    const shifts = await getUserShiftData(userId);
    const replyText = shifts.length > 0
      ? shifts.join('\n')
      : '現在以降のシフトが登録されていません。';

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText
    });
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
