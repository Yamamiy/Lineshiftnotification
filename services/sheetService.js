const { google } = require('googleapis');

// ✅ Google Sheets 認証
const sheetsAuth = new google.auth.GoogleAuth({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_ACCOUNT_BASE64, 'base64').toString()),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

// ✅ 共通で使う定数
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'マスターデータ';
const LOG_SHEET_NAME = '出席ログ';

// ⏎ モジュールとして外に出す
module.exports = {
  sheets,
  SPREADSHEET_ID,
  SHEET_NAME,
  LOG_SHEET_NAME
};
