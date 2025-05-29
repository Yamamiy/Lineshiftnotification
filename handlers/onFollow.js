const line = require('@line/bot-sdk');
const { sheets, SPREADSHEET_ID, SHEET_NAME } = require('../services/sheetService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function onFollow(event) {
  const userId = event.source.userId;

  try {
    // プロフィール取得
    const profile = await client.getProfile(userId);
    const name = profile.displayName;

    // すでに登録されているか確認（C列 = userId列）
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!C2:C`,
    });
    const existingIds = (sheetData.data.values || []).flat();
    if (existingIds.includes(userId)) return;

    // 時刻を日本時間で取得
    const datetime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // A: 登録日時, B: 部署（空欄）, C: userId, D: LINE表示名
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[datetime, '', userId, name]]
      }
    });

    // 本文シートのG3セルからFlexテンプレ文字列を取得
    const flexResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `本文!G3`,
    });

    const flexString = (flexResponse.data.values || [])[0]?.[0];
    if (!flexString) throw new Error('G3セルが空です');

    // JSONとしてパース
    const flexJson = JSON.parse(flexString);

    // Flex Message送信
    await client.pushMessage(userId, {
      type: 'flex',
      altText: '所属部署を選択してください',
      contents: flexJson
    });

  } catch (err) {
    console.error('onFollowエラー:', err);
  }
};
