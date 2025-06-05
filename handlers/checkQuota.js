// checkQuota.js

const axios = require('axios');

const ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

async function getMessageQuotaUsage() {
  try {
    const response = await axios.get(
      'https://api.line.me/v2/bot/message/quota/consumption',
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );

    const used = response.data.totalUsage;
    console.log(`📊 現在の使用通数：${used} 通`);

  } catch (error) {
    console.error('❌ クォータ取得失敗:', error.response?.data || error.message);
  }
}

getMessageQuotaUsage();
