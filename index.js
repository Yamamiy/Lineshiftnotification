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

// Google Sheets API（マスターデータ記録用）
const sheetsAuth = new google.auth.GoogleAuth({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString()),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'マスターデータ';

// シフト検索用（別認証でreadonly）
async function getUserShiftData(userId) {
  const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString());
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );
  const sheetsReadonly = google.sheets({ version: 'v4', auth });

  const range = 'テストシフト_企画_読み取り用_一日目!A3:F';
  const res = await sheetsReadonly.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });
  const values = res.data.values || [];

  const now = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const nowStr = now.toTimeString().slice(0, 5);

  return values
    .filter(row => row[2] === userId && typeof row[3] === 'string' && row[3] >= nowStr)
    .slice(0, 4)
    .map(row => ({
      time: row[3] || '??:??',
      point: row[5] || '場所不明',
      club: row[4] || '担当不明'
    }));
}

function createTimelineFlex(name, shifts) {
  const blocks = [];

  shifts.forEach((shift, index) => {
    const color = index === 0 ? "#EF454D" : "#6486E3";

    blocks.push(
      {
        type: "box",
        layout: "horizontal",
        spacing: "lg",
        cornerRadius: "30px",
        margin: index === 0 ? "xl" : "none",
        contents: [
          { type: "text", text: shift.time, size: "sm", gravity: "center" },
          {
            type: "box",
            layout: "vertical",
            flex: 0,
            contents: [
              { type: "filler" },
              {
                type: "box",
                layout: "vertical",
                contents: [],
                width: "12px",
                height: "12px",
                borderWidth: "2px",
                borderColor: color,
                cornerRadius: "30px"
              },
              { type: "filler" }
            ]
          },
          { type: "text", text: shift.club, gravity: "center", flex: 4, size: "sm" }
        ]
      },
      {
        type: "box",
        layout: "horizontal",
        height: "64px",
        spacing: "lg",
        contents: [
          { type: "box", layout: "baseline", flex: 1, contents: [{ type: "filler" }] },
          {
            type: "box",
            layout: "vertical",
            width: "12px",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                flex: 1,
                contents: [
                  { type: "filler" },
                  { type: "box", layout: "vertical", width: "2px", backgroundColor: color, contents: [] },
                  { type: "filler" }
                ]
              }
            ]
          },
          { type: "text", text: shift.point, gravity: "center", flex: 4, size: "xs", color: "#8c8c8c" }
        ]
      }
    );
  });

  return {
    type: "flex",
    altText: `${name}さんのこれからのシフト`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${name}さんのこれからのシフト`,
            size: "md",
            color: "#FFFFFF",
            weight: "bold",
            align: "center"
          }
        ],
        paddingAll: "20px",
        backgroundColor: "#0367D3",
        height: "20px",
        paddingTop: "22px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: blocks
      }
    }
  };
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
      const text = event.message.text;

      if (text.trim() === 'シフト検索') {
        try {
          const profile = await client.getProfile(userId);
          const name = profile.displayName;

          const shifts = await getUserShiftData(userId);
          if (shifts.length === 0) {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: `${name}さんのこれからのシフトは登録されていません。`
            });
            return;
          }

          const flex = createTimelineFlex(name, shifts);
          console.log('送信Flex構造:', JSON.stringify(flex, null, 2));

          await client.replyMessage(event.replyToken, {
            messages: [
              {
                type: "flex",
                altText: flex.altText,
                contents: flex.contents,
              }
            ]
          });
        } catch (err) {
          console.error('シフト検索中のFlex送信エラー:', err);
        }
      }
    }
  }
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhookサーバー起動中！ポート: ${PORT}`);
});
