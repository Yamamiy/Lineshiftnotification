const line = require('@line/bot-sdk');
const { sheets, SPREADSHEET_ID, LOG_SHEET_NAME } = require('../services/sheetService');
const { getUserNameFromMaster } = require('../services/templateService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function onPostback(event) {
  const userId = event.source.userId;
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
        return;
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
      console.error('onPostbackエラー:', err);
    }
  }
};
