const line = require('@line/bot-sdk');
const querystring = require('querystring');
const { sheets, SPREADSHEET_ID, SHEET_NAME } = require('../services/sheetService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function onPostback(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const data = querystring.parse(event.postback.data);

  try {
    if (data.form_step === 'select_department') {
      const selectedDept = data.value;
      console.log(`✅ 部署選択を検出：${selectedDept}`);

      // userIdの行を検索
      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C2:C`,
      });

      const rows = sheetData.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === userId);
      if (rowIndex === -1) {
        console.error('❌ 該当userIdが見つからない');
        return;
      }

      const targetRow = rowIndex + 2;

      // B列（部署）に書き込み
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!B${targetRow}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[selectedDept]]
        }
      });

      console.log(`📝 部署「${selectedDept}」をB${targetRow}に登録`);

      // フルネーム入力依頼メッセージ（replyで返す）
      await client.replyMessage(replyToken, {
        type: 'text',
        text: '次にあなたのフルネーム（漢字フルネーム）を送信してください。'
      });

      console.log('📨 フルネーム入力依頼をreplyで送信');

    } else {
      console.log('⚠️ 想定外のform_step');
    }

  } catch (err) {
    console.error('🔥 onPostbackエラー:', err.message || err);
  }
};
