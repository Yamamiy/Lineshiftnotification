const line = require('@line/bot-sdk');
const querystring = require('querystring');
const { sheets, SPREADSHEET_ID, SHEET_NAME } = require('../services/sheetService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function followHandler(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const eventType = event.type;

  try {
    // ① follow（登録＋Flex送信）
    if (eventType === 'follow') {
      console.log(`🔔 follow検出：userId=${userId}`);

      const profile = await client.getProfile(userId);
      const displayName = profile.displayName;
      const datetime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C2:C`,
      });

      const existingIds = (sheetData.data.values || []).flat();
      if (existingIds.includes(userId)) {
        console.log('⚠️ 既に登録済みのuserId：スキップ');
        return;
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[datetime, '', userId, displayName, '']]
        }
      });
      console.log('📝 新規登録完了');

      const flexResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `本文!G3`,
      });

      const flexString = (flexResponse.data.values || [])[0]?.[0];
      if (!flexString) throw new Error('G3セルが空');

      const flexJson = JSON.parse(flexString);
      await client.pushMessage(userId, {
        type: 'flex',
        altText: '所属部署を選択してください',
        contents: flexJson
      });

      console.log('📤 Flexメッセージ送信完了');
    }

    // ② postback（部署記録）
    else if (eventType === 'postback') {
      const data = querystring.parse(event.postback.data);
      if (data.form_step !== 'select_department') return;

      const selectedDept = data.value;
      console.log(`✅ 部署選択：${selectedDept}`);

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
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!E${targetRow}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[selectedDept]]
        }
      });
      console.log(`📝 E${targetRow} に部署記録`);

      await client.replyMessage(replyToken, {
        type: 'text',
        text: '次にあなたのフルネーム（漢字フルネーム）を送信してください。'
      });
    }

    // ③ message（名前記録）
    else if (eventType === 'message' && event.message.type === 'text') {
      const fullName = event.message.text;
      console.log(`✉️ 名前入力検出：「${fullName}」 from ${userId}`);

      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C2:C`,
      });

      const rows = sheetData.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === userId);
      if (rowIndex === -1) {
        console.error('❌ userIdが見つからず、名前登録スキップ');
        return;
      }

      const targetRow = rowIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!B${targetRow}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[fullName]]
        }
      });
      console.log(`📝 B${targetRow} に名前記録`);

      await client.replyMessage(replyToken, {
        type: 'text',
        text: '登録完了です！ありがとうございます。当日の運営よろしくお願いします！'
      });
    }

  } catch (err) {
    console.error('🔥 followHandlerエラー:', err.message || err);
  }
};
