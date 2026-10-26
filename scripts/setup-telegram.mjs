// Configure Telegram Bot webhook, chat menu button and commands.
// Usage: node scripts/setup-telegram.mjs [domain]
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

// Parse .env if present
const env = { ...process.env };
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)\s*=\s*(['"]?)(.*)\2$/.exec(trimmed);
    if (match) env[match[1]] = match[3];
  }
}

const token = env.TG_BOT_TOKEN;
const secret = env.TG_WEBHOOK_SECRET;
const username = env.TG_BOT_USERNAME || 'DaiPochitatBot';
const host = process.argv[2] || env.TG_DOMAIN || 'dai-pochitat.app';

if (!token || !secret) {
  console.error('Error: Missing TG_BOT_TOKEN or TG_WEBHOOK_SECRET in .env');
  process.exit(1);
}

async function tg(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    console.error(`Telegram API error in ${method}:`, data);
  }
  return data;
}

console.log(`Setting up @${username} for https://${host}...`);

// 1. setWebhook
const webhookRes = await tg('setWebhook', {
  url: `https://${host}/api/tg/webhook`,
  secret_token: secret,
  allowed_updates: ['message', 'inline_query'],
});
console.log('Webhook configured:', webhookRes.ok ? '✓ OK' : '✗ Failed');

// 2. setChatMenuButton (opens Mini App)
const menuRes = await tg('setChatMenuButton', {
  menu_button: {
    type: 'web_app',
    text: '📚 Библиотека',
    web_app: { url: `https://${host}/?tgapp=1` },
  },
});
console.log('Chat menu button configured:', menuRes.ok ? '✓ OK' : '✗ Failed');

// 3. setMyCommands
const cmdRes = await tg('setMyCommands', {
  commands: [
    { command: 'start', description: 'Войти на сайт библиотеки «Дай почитать!»' },
  ],
});
console.log('Bot commands configured:', cmdRes.ok ? '✓ OK' : '✗ Failed');

// 4. Verify with getWebhookInfo
const info = await tg('getWebhookInfo');
console.log('\nCurrent webhook info:', info.result);
