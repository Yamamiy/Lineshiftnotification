const express = require('express');
const crypto = require('crypto');
const line = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const onFollow = require('./handlers/onFollow');
const onMessage = require('./handlers/onMessage');
const onPostback = require('./handlers/onPostback');

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-line-signature'];
  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac('SHA256', config.channelSecret).update(body).digest('base64');

  if (hash !== signature) {
    console.warn('❌ シグネチャ不一致');
    return res.status(403).send('Invalid signature');
  }

  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'follow') await onFollow(event);
    else if (event.type === 'message' && event.message.type === 'text') await onMessage(event);
    else if (event.type === 'postback') await onPostback(event);
  }

  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhookサーバー起動中！ポート: ${PORT}`);
});
