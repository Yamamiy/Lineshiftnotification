const line = require('@line/bot-sdk');
const { sheets, SPREADSHEET_ID } = require('../services/sheetService');
const { getUserShiftData, fillTemplate } = require('../services/templateService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function onMessage(event) {
  const userId = event.source.userId;
  const text = event.message.text.trim();

  let sheetName = '';
  if (text === '企画部:シフト検索') sheetName = '幹部テスト2025/05/27';
  else if (text === '総務部:シフト検索') sheetName = '幹部テスト2025/05/26';
  else return;

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
    console.error('onMessageエラー:', err);
  }
};
