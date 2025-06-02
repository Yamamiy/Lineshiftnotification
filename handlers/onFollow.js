const line = require('@line/bot-sdk');
const { sheets, SPREADSHEET_ID, SHEET_NAME } = require('../services/sheetService');

const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

module.exports = async function onFollow(event) {
  const userId = event.source.userId;

  try {
    console.log(`🔔 follow検出：userId=${userId}`);

    // プロフィール取得
    const profile = await client.getProfile(userId);
    const displayName = profile.displayName;
    const datetime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // 既登録チェック
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!C2:C`,
    });

    const existingIds = (sheetData.data.values || []).flat();
    if (existingIds.includes(userId)) {
      console.log('⚠️ 既に登録済みのuserId：スキップ');
      return;
    }

    // スプレッドシート登録：A:日時 B:名前 C:userId D:表示名 E:部署
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

    // Flexテンプレ読み込み（本文!G3）
    const flexResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `本文!H3`,
    });

    const flexString = (flexResponse.data.values || [])[0]?.[0];
    if (!flexString) throw new Error('❌ G3セルが空');

    const flexJson = JSON.parse(flexString);

    // Flex送信
    await client.pushMessage(userId, {
      type: 'flex',
      altText: '所属部署を選択してください',
      contents: flexJson
    });

    console.log('📤 Flexメッセージ送信完了');

  } catch (err) {
    console.error('🔥 onFollowエラー:', err.message || err);
  }
};
