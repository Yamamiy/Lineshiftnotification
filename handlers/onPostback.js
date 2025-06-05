const line = require('@line/bot-sdk');
const querystring = require('querystring');
const { sheets, SPREADSHEET_ID, SHEET_NAME, LOG_SHEET_NAME } = require('../services/sheetService');
const { getUserNameFromMaster } = require('../services/templateService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function onPostback(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  const params = new URLSearchParams(event.postback.data);
  const action = params.get('action');
  const shiftId = params.get('shiftId');

  // ✅ 部署選択処理
  const queryData = querystring.parse(event.postback.data);
  if (queryData.form_step === 'select_department') {
    const selectedDept = queryData.value;
    console.log(`✅ 部署選択：${selectedDept}`);

    try {
      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C2:C`,
      });

      const rows = sheetData.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === userId);
      if (rowIndex === -1) {
        console.error('❌ userIdがC列に見つからない');
        return;
      }

      const targetRow = rowIndex + 2;

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `${SHEET_NAME}!E${targetRow}`, values: [[selectedDept]] },
            { range: `${SHEET_NAME}!F${targetRow}`, values: [['pending']] }
          ]
        }
      });

      console.log(`📝 E${targetRow} に部署記録 & F列ステータス設定`);

      await client.replyMessage(replyToken, {
        type: 'text',
        text: '次にあなたのフルネーム（漢字フルネーム）を送信してください。'
      });
    } catch (err) {
      console.error('onPostback 部署選択エラー:', err.message || err);
    }

    return;
  }

  // ✅ 参加ボタン処理（従来の処理）
  if (action === 'attend' && shiftId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LOG_SHEET_NAME}!B2:C`,
    });

    const rows = response.data.values || [];

    // 同じ userId & shiftId の記録回数をカウント
    const count = rows.filter(row => row[0] === userId && row[1] === shiftId).length;

    if (count === 1) {
      // 2回目の反応：注意メッセージを送る
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'すでに参加報告済みです！ありがとう！'
      });
      return;
    }

    if (count >= 2) {
      // 3回目以降は無視（無反応）
      return;
    }

    // 初回：出席記録を追加
    const name = await getUserNameFromMaster(userId);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LOG_SHEET_NAME}!A:D`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[name, userId, shiftId, new Date().toISOString()]]
      }
    });

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📝 参加記録を受け付けました！ありがとう！'
    });

  } catch (err) {
    console.error('onPostback 参加処理エラー:', err);
  }
}
};
