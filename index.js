// ✅ 必要ライブラリ
const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const app = express();
const crypto = require('crypto');
app.use(express.json());

// ✅ LINE設定
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// ✅ Google Sheets 認証
const sheetsAuth = new google.auth.GoogleAuth({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString()),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'マスターデータ';
const LOG_SHEET_NAME = '出席ログ';

// ✅ 名前取得（マスターデータ）
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

// ✅ シフト検索
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

// ✅ Webhook署名手動検証 + 処理本体
app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-line-signature'];
  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac('SHA256', config.channelSecret).update(body).digest('base64');

  if (hash !== signature) {
    console.warn('❌ シグネチャ不一致（SignatureValidationFailed）');
    return res.status(403).send('Invalid signature');
  }

  const events = req.body.events;

  for (const event of events) {
    const userId = event.source.userId;

    // 友だち登録
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

    // シフト検索
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

    // 出席Postback処理
    if (event.type === 'postback') {
      const params = new URLSearchParams(event.postback.data);
      const action = params.get('action');
      const shiftId = params.get('shiftId');

      if (action === 'attend' && shiftId) {
        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${LOG_SHEET_NAME}!B2:C`,
          });
          const rows = response.data.values || [];
          const alreadyExists = rows.some(row => row[0] === userId && row[1] === shiftId);

          if (alreadyExists) {
            await client.pushMessage(userId, {
              type: 'text',
              text: 'すでに参加報告済みです！ありがとう！'
            });
            continue;
          }

          const name = await getUserNameFromMaster(userId);

          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${LOG_SHEET_NAME}!A:D`,
            valueInputOption: 'USER_ENTERED',
            resource: {
              values: [[name, userId, shiftId, new Date().toISOString()]]
            }
          });

          await client.pushMessage(userId, {
            type: 'text',
            text: '📝 参加記録を受け付けました！ありがとう！'
          });
        } catch (err) {
          console.error('記録エラー:', err);
        }
      }
    }
  }

  res.status(200).send('OK');
});

// ✅ サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhookサーバー起動中！ポート: ${PORT}`);
});
