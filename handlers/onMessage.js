const line = require('@line/bot-sdk');
const { sheets, SPREADSHEET_ID, SHEET_NAME } = require('../services/sheetService');
const { getUserShiftData, fillTemplate } = require('../services/templateService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function onMessage(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const text = event.message.text.trim();

  // ▼ ① シフト検索処理
  let sheetName = '';
  if (text === '企画部:シフト検索') sheetName = '幹部テスト2025/05/27';
  else if (text === '総務部:シフト検索') sheetName = '幹部テスト2025/05/26';

  if (sheetName !== '') {
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
        await client.replyMessage(replyToken, {
          type: 'text',
          text: noShiftMsg
        });
        return;
      }

      const templateString = flexRes.data.values?.[0]?.[0] || '';
      const filledJson = fillTemplate([templateString], nameFromSheet, shiftData);

      await client.replyMessage(replyToken, {
        type: 'flex',
        altText: altTextRaw,
        contents: JSON.parse(filledJson)
      });

    } catch (err) {
      console.error('🔥 シフト検索エラー:', err);
    }
    return;
  }

  // ▼ ② 名前記録処理（それ以外の入力）
  try {
    const fullName = text;
    console.log(`✉️ 名前入力検出：「${fullName}」 from ${userId}`);

    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!C2:F`,
    });

    const rows = sheetData.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === userId);
    if (rowIndex === -1) {
      console.error('❌ userIdが見つからず、名前登録スキップ');
      return;
    }

    const status = rows[rowIndex][3] || '';
    if (status !== 'pending') {
      console.warn('⚠️ 名前登録が既に完了済み or ステータス不一致のためスキップ');
      return;
    }

    const targetRow = rowIndex + 2;
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `${SHEET_NAME}!B${targetRow}`,
            values: [[fullName]]
          },
          {
            range: `${SHEET_NAME}!F${targetRow}`,
            values: [['done']]
          }
        ]
      }
    });

    console.log(`📝 B${targetRow} に名前「${fullName}」を記録`);

    await client.replyMessage(replyToken, {
      type: 'text',
      text: '登録完了です！ありがとうございます\n当日の運営よろしくお願いします！'
    });

  } catch (err) {
    console.error('🔥 名前登録エラー:', err);
  }
};
