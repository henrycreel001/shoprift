import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const AUTHORIZED_CHAT_ID = Number(process.env.TELEGRAM_AUTHORIZED_CHAT_ID);

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
if (!AUTHORIZED_CHAT_ID) throw new Error('TELEGRAM_AUTHORIZED_CHAT_ID not set in .env');

const bot = new Telegraf(BOT_TOKEN);

// Active jobs: jobKey → { startTime, label }
const activeJobs = new Map();

// Recon cache: storeUrl → { products, collections, images }
const reconCache = new Map();

// Receipt counter — persists across bot restarts
const RECEIPT_COUNTER_PATH = './output/.receipt_counter.json';

function nextReceiptNumber() {
  let n = 1;
  if (fs.existsSync(RECEIPT_COUNTER_PATH)) {
    try { n = JSON.parse(fs.readFileSync(RECEIPT_COUNTER_PATH, 'utf8')).next || 1; } catch {}
  }
  fs.mkdirSync('./output', { recursive: true });
  fs.writeFileSync(RECEIPT_COUNTER_PATH, JSON.stringify({ next: n + 1 }), 'utf8');
  const year = new Date().getFullYear();
  const yy = String(year + 1).slice(2);
  return `SRFT/${year}-${yy}/R${String(n).padStart(3, '0')}`;
}

function findNewestFile(dir, suffix) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith(suffix))
    .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] ? path.join(dir, files[0].f) : null;
}

// Auth middleware — only authorized chat can use bot
function authOnly(ctx, next) {
  if (ctx.chat?.id !== AUTHORIZED_CHAT_ID) {
    return ctx.reply('Unauthorized.');
  }
  return next();
}

bot.use(authOnly);

// ── /start ──────────────────────────────────────────────────────────────────
bot.command('start', ctx => {
  ctx.reply(
    `Shoprift Concierge Bot\n\n` +
    `/recon <url>   — recon scan + 5-product sample CSV\n` +
    `/extract <url> — full extraction + delivery ZIP\n` +
    `/receipt "Client Name" store-url amount upi-ref — payment receipt\n` +
    `/jobs          — show active jobs\n\n` +
    `Example:\n` +
    `/recon https://store.dm2buy.com`
  );
});

// ── /jobs ────────────────────────────────────────────────────────────────────
bot.command('jobs', ctx => {
  if (activeJobs.size === 0) return ctx.reply('No active jobs.');
  const lines = [...activeJobs.entries()].map(([url, j]) => {
    const mins = Math.round((Date.now() - j.startTime) / 60000);
    return `• ${j.label} (${url}) — ${mins}m ago`;
  });
  ctx.reply(lines.join('\n'));
});

// ── /recon ───────────────────────────────────────────────────────────────────
bot.command('recon', async ctx => {
  const url = ctx.message.text.split(' ')[1]?.trim();
  if (!url || !url.startsWith('http')) {
    return ctx.reply('Usage: /recon https://store.dm2buy.com');
  }

  const jobKey = `recon:${url}`;
  if (activeJobs.has(jobKey)) return ctx.reply(`Recon already running for ${url}`);

  activeJobs.set(jobKey, { startTime: Date.now(), label: 'recon' });
  await ctx.reply(`Recon starting for ${url}...`);

  const child = spawn('node', ['scripts/recon_sample.js', url, '--count', '5'], {
    cwd: process.cwd(), env: process.env
  });

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async code => {
    activeJobs.delete(jobKey);

    if (code !== 0) {
      return ctx.reply(`Recon failed:\n${stderr.slice(-500)}`);
    }

    // Parse recon data from stdout
    const get = pattern => stdout.match(pattern)?.[1]?.trim() ?? '';
    const storeName   = get(/Store:\s+(.+)/);
    const instagram   = get(/Instagram:\s+@?(.+)/);
    const products    = parseInt(get(/Products:\s+(\d+)/), 10)    || 0;
    const collections = parseInt(get(/Collections:\s+(\d+)/), 10) || 0;
    const images      = parseInt(get(/Images:\s+(\d+)/), 10)      || 0;
    const estTime     = get(/Est\. import:\s+(.+)/);
    const date        = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Cache for /receipt auto-fill
    reconCache.set(url, { products, collections, images });

    // Generate summary JPG via Playwright
    const payload = JSON.stringify({ storeName, instagram, storeUrl: url, products, collections, images, estTime, date });
    await new Promise(resolve => {
      const img = spawn('node', ['scripts/generate_recon_summary.js', payload], {
        cwd: process.cwd(), env: process.env
      });
      let imgOut = '';
      img.stdout.on('data', d => { imgOut += d.toString(); });
      img.on('close', async imgCode => {
        const jpgPath = imgOut.trim();
        if (imgCode === 0 && jpgPath && fs.existsSync(jpgPath)) {
          await ctx.replyWithPhoto(
            { source: jpgPath },
            { caption: `${storeName} — ${products} products · ${collections} collections · ${images} images` }
          );
        } else {
          // Fallback: send text block from stdout
          const summaryMatch = stdout.match(/━+[\s\S]*?━+/);
          await ctx.reply(summaryMatch?.[0]?.trim() ?? stdout.slice(0, 600));
        }
        resolve();
      });
    });

    // Send sample CSV
    const csvPath = findNewestFile('./output', '.csv');
    if (csvPath) {
      await ctx.replyWithDocument({ source: csvPath, filename: path.basename(csvPath) });
    } else {
      await ctx.reply('CSV not found — check output/ folder manually.');
    }
  });
});

// ── /extract ──────────────────────────────────────────────────────────────────
bot.command('extract', async ctx => {
  const url = ctx.message.text.split(' ')[1]?.trim();
  if (!url || !url.startsWith('http')) {
    return ctx.reply('Usage: /extract https://store.dm2buy.com');
  }

  const jobKey = `extract:${url}`;
  if (activeJobs.has(jobKey)) return ctx.reply(`Extraction already running for ${url}`);

  activeJobs.set(jobKey, { startTime: Date.now(), label: 'extract' });
  await ctx.reply(`Extraction starting for ${url}\nThis takes 10–20 min. Delivery ZIP incoming when done.`);

  const child = spawn(
    'node',
    ['src/index.js', url, '--zip', '--yes', '--auto-approve'],
    { cwd: process.cwd(), env: process.env }
  );

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async code => {
    activeJobs.delete(jobKey);

    if (code !== 0) {
      const tail = (stdout + stderr).slice(-800);
      await ctx.reply(`Extraction failed:\n${tail}`);
      return;
    }

    // Find delivery ZIP in output subdirs
    let zipPath = null;
    if (fs.existsSync('./output')) {
      const subdirs = fs.readdirSync('./output')
        .map(d => path.join('./output', d))
        .filter(d => {
          try { return fs.statSync(d).isDirectory(); } catch { return false; }
        });
      const candidates = subdirs.flatMap(d => {
        try {
          return fs.readdirSync(d)
            .filter(f => f.endsWith('_delivery.zip'))
            .map(f => ({ p: path.join(d, f), mtime: fs.statSync(path.join(d, f)).mtimeMs }));
        } catch { return []; }
      }).sort((a, b) => b.mtime - a.mtime);
      if (candidates[0]) zipPath = candidates[0].p;
    }

    if (!zipPath) {
      await ctx.reply(`Extraction done but ZIP not found. Check output/ folder.\n\nLog tail:\n${stdout.slice(-500)}`);
      return;
    }

    const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);

    if (parseFloat(sizeMb) > 49) {
      await ctx.reply(
        `Extraction complete.\n` +
        `ZIP is ${sizeMb} MB — over Telegram 50 MB limit.\n` +
        `File path: ${zipPath}`
      );
      return;
    }

    await ctx.reply(`Extraction complete (${sizeMb} MB). Sending ZIP...`);
    await ctx.replyWithDocument({ source: zipPath, filename: path.basename(zipPath) });
  });
});

// ── /receipt ──────────────────────────────────────────────────────────────────
bot.command('receipt', async ctx => {
  // /receipt "Client Name" store-url amount upi-ref
  const text = ctx.message.text.replace('/receipt', '').trim();
  const match = text.match(/^"([^"]+)"\s+(\S+)\s+(\d+)\s+(\S+)/) ||
                text.match(/^(\S+)\s+(\S+)\s+(\d+)\s+(\S+)/);

  if (!match) {
    return ctx.reply(
      'Usage: /receipt "Client Name" store-url amount upi-ref\n' +
      'Example: /receipt "Pookie Scoopee" pookiescoopee.dm2buy.com 800 UPI123456789\n\n' +
      'Tip: run /recon first — products/collections/images auto-fill.'
    );
  }

  const [, clientName, storeUrl, amount, upiRef] = match;
  const cached = reconCache.get(`https://${storeUrl}`) || reconCache.get(storeUrl) || {};
  const receiptNo = nextReceiptNumber();
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const payload = JSON.stringify({
    receiptNo, date, clientName, storeUrl, amount, upiRef,
    products:    cached.products    ?? 0,
    collections: cached.collections ?? 0,
    images:      cached.images      ?? 0,
  });

  await ctx.reply(`Generating receipt ${receiptNo}...`);

  const child = spawn('node', ['scripts/generate_receipt.js', payload], {
    cwd: process.cwd(), env: process.env
  });

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async code => {
    if (code !== 0) {
      return ctx.reply(`Receipt failed:\n${stderr.slice(-400)}`);
    }
    const pdfPath = stdout.trim();
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return ctx.reply(`PDF not found at: ${pdfPath}`);
    }
    const filename = `shoprift-receipt-${receiptNo.split('/').pop().toLowerCase()}.pdf`;
    await ctx.replyWithDocument({ source: pdfPath, filename });
  });
});

// ── unknown command ──────────────────────────────────────────────────────────
bot.on('text', ctx => {
  if (!ctx.message.text.startsWith('/')) return;
  ctx.reply('Unknown command. Send /start for help.');
});

// ── launch ───────────────────────────────────────────────────────────────────
bot.launch();

console.log(`
┌─────────────────────────────────┐
│  Shoprift Concierge Bot         │
│  Chat ID: ${AUTHORIZED_CHAT_ID}${' '.repeat(Math.max(0, 22 - String(AUTHORIZED_CHAT_ID).length))}│
│  Send /start on Telegram        │
└─────────────────────────────────┘
`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
