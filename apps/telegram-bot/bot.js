import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToDrive } from './src/drive-uploader.js';
import { createClient } from '@supabase/supabase-js';

// __dirname equivalent for ESM — resolves paths relative to this bot.js file
const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const AUTHORIZED_CHAT_ID = Number(process.env.TELEGRAM_AUTHORIZED_CHAT_ID);

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
if (!AUTHORIZED_CHAT_ID) throw new Error('TELEGRAM_AUTHORIZED_CHAT_ID not set in .env');

const bot = new Telegraf(BOT_TOKEN);

// Active jobs: jobKey → { startTime, label, child }
const activeJobs = new Map();

// Recon cache: storeUrl → { products, collections, images }
const reconCache = new Map();

// Pending extract confirmations: token → url (Fix 2 — 64-byte callback_data limit)
const pendingExtracts = new Map();

// Receipt counter — persists in bot's own output folder across restarts
const RECEIPT_COUNTER_PATH = path.join(BOT_DIR, 'output', '.receipt_counter.json');

function nextReceiptNumber() {
  let n = 1;
  if (fs.existsSync(RECEIPT_COUNTER_PATH)) {
    try { n = JSON.parse(fs.readFileSync(RECEIPT_COUNTER_PATH, 'utf8')).next || 1; } catch {}
  }
  fs.mkdirSync(path.join(BOT_DIR, 'output'), { recursive: true });
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

/**
 * Returns (and creates) apps/telegram-bot/output/{subdomain}_{YYYY-MM-DD}/
 * All files for one client job stage here for easy Google Drive upload.
 */
function clientOutputDir(url) {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const subdomain = new URL(normalized).hostname.split('.')[0];
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dir = path.join(BOT_DIR, 'output', `${subdomain}_${date}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch { return null; }
}

/** Copies src file into destDir. Returns dest path or null on failure. */
function stageFile(srcPath, destDir, filename) {
  if (!srcPath || !destDir || !fs.existsSync(srcPath)) return null;
  const dest = path.join(destDir, filename || path.basename(srcPath));
  try { fs.copyFileSync(srcPath, dest); return dest; } catch { return null; }
}

// Auth middleware — only authorized chat can use bot
function authOnly(ctx, next) {
  if (ctx.chat?.id !== AUTHORIZED_CHAT_ID) {
    return ctx.reply('Unauthorized.');
  }
  return next();
}

bot.use(authOnly);

const HELP_TEXT =
  `Shoprift Concierge Bot\n\n` +
  `/recon <url>        — recon scan + 5-product sample CSV\n` +
  `/extract <url>      — full extraction + delivery ZIP\n` +
  `/receipt "Client Name" store-url amount upi-ref — payment receipt\n` +
  `/jobs               — show active jobs\n` +
  `/cancel <url>       — cancel a running job\n` +
  `/clearjobs          — kill all jobs + reset stuck Supabase jobs\n\n` +
  `Example:\n` +
  `/recon https://store.dm2buy.com`;

// ── /start ──────────────────────────────────────────────────────────────────
bot.command('start', ctx => ctx.reply(HELP_TEXT));

// ── /help ────────────────────────────────────────────────────────────────────
bot.command('help',  ctx => ctx.reply(HELP_TEXT));

// ── /jobs ────────────────────────────────────────────────────────────────────
bot.command('jobs', ctx => {
  if (activeJobs.size === 0) return ctx.reply('No active jobs.');
  const lines = [...activeJobs.entries()].map(([url, j]) => {
    const mins = Math.round((Date.now() - j.startTime) / 60000);
    return `• ${j.label} (${url}) — ${mins}m ago`;
  });
  ctx.reply(lines.join('\n'));
});

// ── /cancel ──────────────────────────────────────────────────────────────────
bot.command('cancel', async ctx => {
  const url = ctx.message.text.split(' ')[1]?.trim();

  if (!url) {
    if (activeJobs.size === 0) return ctx.reply('No active jobs.');
    const lines = [...activeJobs.entries()].map(([key, j]) => `• ${j.label} — ${key.split(':').slice(1).join(':')}`);
    return ctx.reply(`Cancellable jobs:\n${lines.join('\n')}\n\nUsage: /cancel <url>`);
  }

  // Check both job key prefixes
  const reconKey   = `recon:${url}`;
  const extractKey = `extract:${url}`;
  const jobKey     = activeJobs.has(reconKey) ? reconKey : activeJobs.has(extractKey) ? extractKey : null;

  if (!jobKey) return ctx.reply(`No active job for ${url}`);

  const job = activeJobs.get(jobKey);
  job.cancelled = true;                    // set flag BEFORE kill so close handler can check it
  try { job.child?.kill('SIGTERM'); } catch (e) {
    console.error(JSON.stringify({ phase: 'cancel', url, error: e.message }));
  }
  activeJobs.delete(jobKey);
  await ctx.reply(`Cancelled: ${job.label} for ${url}`);
});

// ── /clearjobs ───────────────────────────────────────────────────────────────
bot.command('clearjobs', async ctx => {
  // 1. Kill all local child processes and clear the Map
  let killed = 0;
  for (const [key, job] of activeJobs.entries()) {
    job.cancelled = true;
    try { job.child?.kill('SIGTERM'); } catch {}
    activeJobs.delete(key);
    killed++;
  }
  pendingExtracts.clear();

  // 2. Mark stuck Supabase jobs as failed
  let dbCleared = 0;
  if (supabase) {
    try {
      const stuckStatuses = ['recon', 'verifying', 'extracting', 'downloading'];
      const { data, error } = await supabase
        .from('import_jobs')
        .update({ status: 'failed', error: 'Manually cleared via /clearjobs', updated_at: new Date().toISOString() })
        .in('status', stuckStatuses)
        .select('id');
      if (!error) dbCleared = data?.length ?? 0;
    } catch (e) {
      console.error(JSON.stringify({ phase: 'clearjobs', error: e.message }));
    }
  }

  const parts = [];
  if (killed > 0)    parts.push(`${killed} local job${killed > 1 ? 's' : ''} killed`);
  if (dbCleared > 0) parts.push(`${dbCleared} Supabase job${dbCleared > 1 ? 's' : ''} marked failed`);
  if (!supabase)     parts.push('Supabase not configured — only local jobs cleared');

  await ctx.reply(parts.length ? `Cleared: ${parts.join(', ')}.` : 'No active jobs to clear.');
});

// ── /recon ───────────────────────────────────────────────────────────────────
bot.command('recon', async ctx => {
  const url = ctx.message.text.split(' ')[1]?.trim();
  if (!url || !url.startsWith('http')) {
    return ctx.reply('Usage: /recon https://store.dm2buy.com');
  }

  const jobKey = `recon:${url}`;
  if (activeJobs.has(jobKey)) return ctx.reply(`Recon already running for ${url}`);

  // Step 1: claim slot synchronously before any await (closes race window)
  activeJobs.set(jobKey, { startTime: Date.now(), label: 'recon', child: null });
  await ctx.reply(`Recon starting for ${url}...`);

  // Step 2: spawn and patch child reference in-place
  const child = spawn('node', ['scripts/recon_sample.js', url, '--count', '5'], {
    cwd: process.cwd(), env: process.env
  });
  activeJobs.get(jobKey).child = child;

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async (code, signal) => {
    const job = activeJobs.get(jobKey);   // may be undefined if cancelled
    activeJobs.delete(jobKey);
    if (signal || job?.cancelled) return; // killed or cancelled — suppress output

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
      const img = spawn('node', [path.join(BOT_DIR, 'scripts/generate_recon_summary.js'), payload], {
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

    // Stage both files into per-client output folder
    const clientDir = clientOutputDir(url);
    if (clientDir) {
      const jpgPath2 = findNewestFile(path.join(process.cwd(), 'output', 'summaries'), '.jpg');
      stageFile(jpgPath2, clientDir);
      stageFile(csvPath, clientDir);
      await ctx.reply(`Staged → ${clientDir}`);
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

  // Fix 2 — use short token in callback_data (Telegram hard limit: 64 bytes)
  const token = Date.now().toString(36);
  pendingExtracts.set(token, url);

  await ctx.reply(
    `Start full extraction for ${url}?\nEst. 10–20 min.`,
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Yes, extract', `confirm_extract:${token}`),
      Markup.button.callback('❌ Cancel',        `cancel_extract:${token}`),
    ])
  );
});

// ── confirm_extract action ────────────────────────────────────────────────────
bot.action(/^confirm_extract:(.+)$/, async ctx => {
  // Fix 2 — resolve token → url
  const token = ctx.match[1];
  const url = pendingExtracts.get(token);
  if (!url) {
    await ctx.answerCbQuery('Session expired — run /extract again.');
    return;
  }

  const jobKey = `extract:${url}`;
  if (activeJobs.has(jobKey)) {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText(`Extraction already running for ${url}`, { reply_markup: { inline_keyboard: [] } });
    } catch { /* message already updated or too old to edit */ }
    return;
  }

  // Step 1: claim slot and clear pending token synchronously before any await (closes race window)
  activeJobs.set(jobKey, { startTime: Date.now(), label: 'extract', child: null });
  pendingExtracts.delete(token);

  await ctx.answerCbQuery();
  // Fix 1 — clear inline keyboard; Fix 4 — wrap in try/catch
  try {
    await ctx.editMessageText(
      `Extraction starting for ${url}\nThis takes 10–20 min. Delivery ZIP incoming when done.`,
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch { /* message already updated or too old to edit */ }

  // Step 2: spawn and patch child reference in-place
  const child = spawn(
    'node',
    ['src/index.js', url, '--zip', '--yes', '--auto-approve'],
    { cwd: process.cwd(), env: process.env }
  );
  activeJobs.get(jobKey).child = child;

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async (code, signal) => {
    const job = activeJobs.get(jobKey);
    activeJobs.delete(jobKey);
    if (signal || job?.cancelled) return;  // killed or cancelled — suppress output

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

    // Stage ZIP into per-client folder regardless of size
    const clientDir = clientOutputDir(url);
    if (clientDir) stageFile(zipPath, clientDir);

    const driveEnabled = process.env.GOOGLE_OAUTH_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (driveEnabled) {
      await ctx.reply(`Extraction complete — ${sizeMb} MB. Uploading to Google Drive...`);
      try {
        const { url } = await uploadToDrive(zipPath, path.basename(zipPath), 'application/zip');
        await ctx.reply(
          `Done ✅\n\n` +
          `📦 ${path.basename(zipPath)} (${sizeMb} MB)\n` +
          `🔗 ${url}\n\n` +
          `Link works for anyone — forward directly to client.`
        );
      } catch (e) {
        console.error(JSON.stringify({ phase: 'drive_upload', url, error: e.message }));
        await ctx.reply(`Drive upload failed: ${e.message}\n\nFile staged locally:\n${clientDir ?? zipPath}`);
      }
      return;
    }

    if (parseFloat(sizeMb) > 49) {
      await ctx.reply(
        `Extraction complete — ${sizeMb} MB\n` +
        `Too large for Telegram. Add GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_DRIVE_FOLDER_ID to .env for auto-upload.\n\n` +
        `File staged at:\n${clientDir ?? zipPath}`
      );
      return;
    }

    await ctx.reply(`Extraction complete (${sizeMb} MB). Sending ZIP...`);
    await ctx.replyWithDocument({ source: zipPath, filename: path.basename(zipPath) });
    if (clientDir) await ctx.reply(`Also staged → ${clientDir}`);
  });
});

// ── cancel_extract action ─────────────────────────────────────────────────────
bot.action(/^cancel_extract:(.+)$/, async ctx => {
  // Fix 2 — resolve token → url and clean up
  const token = ctx.match[1];
  const url = pendingExtracts.get(token);
  pendingExtracts.delete(token);

  await ctx.answerCbQuery();
  // Fix 1 — clear inline keyboard; Fix 4 — wrap in try/catch
  try {
    await ctx.editMessageText(
      url ? `Extraction cancelled for ${url}.` : 'Extraction cancelled.',
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch { /* message already updated or too old to edit */ }
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

  const child = spawn('node', [path.join(BOT_DIR, 'scripts/generate_receipt.js'), payload], {
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

    // Stage into per-client output folder
    const clientDir = clientOutputDir(storeUrl);
    if (clientDir) {
      stageFile(pdfPath, clientDir, filename);
      await ctx.reply(`Staged → ${clientDir}`);
    }
  });
});

// ── unknown command ──────────────────────────────────────────────────────────
bot.on('text', ctx => {
  if (!ctx.message.text.startsWith('/')) return;
  ctx.reply('Unknown command. Send /start for help.');
});

// ── launch ───────────────────────────────────────────────────────────────────
bot.launch()
  .then(() => bot.telegram.setMyCommands([
    { command: 'recon',   description: 'Recon scan + 5-product sample CSV' },
    { command: 'extract', description: 'Full extraction + delivery ZIP' },
    { command: 'receipt', description: 'Generate payment receipt PDF' },
    { command: 'jobs',    description: 'Show active running jobs' },
    { command: 'cancel',    description: 'Cancel a running job' },
    { command: 'clearjobs', description: 'Kill all active jobs + reset stuck Supabase jobs' },
    { command: 'help',      description: 'Show all commands' },
  ]))
  .catch(err => console.error(JSON.stringify({
    phase: 'startup',
    action: 'setMyCommands',
    error: err.message,
    detail: err.response?.description ?? null,
  })));

console.log(`
┌─────────────────────────────────┐
│  Shoprift Concierge Bot         │
│  Chat ID: ${AUTHORIZED_CHAT_ID}${' '.repeat(Math.max(0, 22 - String(AUTHORIZED_CHAT_ID).length))}│
│  Send /start on Telegram        │
└─────────────────────────────────┘
`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
