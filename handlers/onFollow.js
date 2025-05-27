const line = require('@line/bot-sdk');
const { sheets, SPREADSHEET_ID, SHEET_NAME } = require('../services/sheetService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function onFollow(event) {
  const userId = event.source.userId;

  try {
    const profile = await client.getProfile(userId);
    const name = profile.displayName;

    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!C2:C`,
    });

    const existingIds = (sheetData.data.values || []).flat();
    if (existingIds.includes(userId)) return;

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
    console.error('onFollowエラー:', err);
  }
};
