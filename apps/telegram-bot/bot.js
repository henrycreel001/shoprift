import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToDrive, uploadFolderToDrive } from './src/drive-uploader.js';
import { createClient } from '@supabase/supabase-js';

const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));

const BOT_TOKEN            = process.env.TELEGRAM_BOT_TOKEN;
const AUTHORIZED_CHAT_ID   = Number(process.env.TELEGRAM_AUTHORIZED_CHAT_ID);

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

if (!BOT_TOKEN)          throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
if (!AUTHORIZED_CHAT_ID) throw new Error('TELEGRAM_AUTHORIZED_CHAT_ID not set in .env');

const bot = new Telegraf(BOT_TOKEN);

// Active jobs: jobKey → { startTime, label, child, cancelled, statusMsgId, chatId }
const activeJobs      = new Map();
// Recon cache: storeUrl → { products, collections, images }
const reconCache      = new Map();
// Pending extract confirmations + post-recon extract buttons: token → url
const pendingExtracts = new Map();
// Inline cancel tokens for /jobs: token → jobKey
const cancelTokens    = new Map();
// Retry Drive upload: token → { outputDir, folderName, url }
const retryUploads    = new Map();
// Drive URLs cached after upload: storeUrl → driveUrl (used by /receipt to persist to Supabase)
const driveUrlCache   = new Map();

const RECEIPT_COUNTER_PATH = path.join(BOT_DIR, 'output', '.receipt_counter.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextReceiptNumber() {
  let n = 1;
  if (fs.existsSync(RECEIPT_COUNTER_PATH)) {
    try { n = JSON.parse(fs.readFileSync(RECEIPT_COUNTER_PATH, 'utf8')).next || 1; } catch {}
  }
  fs.mkdirSync(path.join(BOT_DIR, 'output'), { recursive: true });
  fs.writeFileSync(RECEIPT_COUNTER_PATH, JSON.stringify({ next: n + 1 }), 'utf8');
  const year = new Date().getFullYear();
  const yy   = String(year + 1).slice(2);
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

function clientOutputDir(url) {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const subdomain  = new URL(normalized).hostname.split('.')[0];
    const date       = new Date().toISOString().slice(0, 10);
    const dir        = path.join(BOT_DIR, 'output', `${subdomain}_${date}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch { return null; }
}

function stageFile(srcPath, destDir, filename) {
  if (!srcPath || !destDir || !fs.existsSync(srcPath)) return null;
  const dest = path.join(destDir, filename || path.basename(srcPath));
  try { fs.copyFileSync(srcPath, dest); return dest; } catch { return null; }
}

/** Escape HTML special chars for parse_mode: HTML */
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Emoji progress bar: ▓▓▓▓░░░░ 40% */
function progressBar(current, total) {
  const pct    = total > 0 ? Math.round(current / total * 100) : 0;
  const filled = Math.round(pct / 10);
  return `${'▓'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%`;
}

/** Derive display name from store URL subdomain */
function clientNameFromUrl(url) {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const sub = new URL(normalized).hostname.split('.')[0];
    return sub.charAt(0).toUpperCase() + sub.slice(1);
  } catch { return 'Client'; }
}

// ── Persistent reply keyboard ─────────────────────────────────────────────────

const MAIN_KEYBOARD = Markup.keyboard([
  ['🔍 Recon',   '▶️ Extract'],
  ['🧾 Receipt', '📊 Weekly'],
  ['📅 Monthly', '🗂 History'],
  ['📋 Jobs',    '🗓 Queue'],
  ['📤 Export',  '❓ Help'],
  ['✖ Close keyboard'],
]).resize().persistent();

// ── Auth middleware ───────────────────────────────────────────────────────────

function authOnly(ctx, next) {
  if (ctx.chat?.id !== AUTHORIZED_CHAT_ID) return ctx.reply('Unauthorized.');
  return next();
}

bot.use(authOnly);

// ── /start · /help ────────────────────────────────────────────────────────────

const HELP_TEXT =
  `<b>Shoprift Concierge</b>\n` +
  `━━━━━━━━━━━━━━━━━━━━\n\n` +
  `<b>Extraction</b>\n` +
  `/recon <code>url</code> — quick store scan\n` +
  `/extract <code>url</code> — full extraction + Drive delivery\n` +
  `/quote <code>url</code> — price quote for client\n` +
  `/queue <code>url</code> — add to batch queue (runs overnight)\n` +
  `/queue — show queue status · /queue clear — remove pending\n\n` +
  `<b>Billing</b>\n` +
  `/receipt <code>"Name" url amount upi-ref</code> — payment receipt\n` +
  `/redeliver <code>receipt-no</code> — resend Drive folder link\n` +
  `/export — payments CSV file\n\n` +
  `<b>Reports</b>\n` +
  `/history — last 10 transactions\n` +
  `/report — this week's revenue\n` +
  `/report month — this month's revenue\n\n` +
  `<b>Jobs</b>\n` +
  `/jobs — active jobs with cancel buttons\n` +
  `/cancel <code>url</code> — stop a job\n` +
  `/clearjobs — kill all + reset Supabase`;

bot.command('start', ctx => ctx.reply(HELP_TEXT, { parse_mode: 'HTML', ...MAIN_KEYBOARD }));
bot.command('help',  ctx => ctx.reply(HELP_TEXT, { parse_mode: 'HTML', ...MAIN_KEYBOARD }));

// ── /jobs ─────────────────────────────────────────────────────────────────────

bot.command('jobs', ctx => {
  if (activeJobs.size === 0) return ctx.reply('No active jobs.');

  const lines   = [];
  const buttons = [];

  for (const [key, j] of activeJobs.entries()) {
    const mins   = Math.round((Date.now() - j.startTime) / 60000);
    const jobUrl = key.split(':').slice(1).join(':');
    lines.push(`• <b>${esc(j.label)}</b> — <code>${esc(jobUrl)}</code> (${mins}m)`);

    const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    cancelTokens.set(token, key);
    buttons.push([Markup.button.callback(`❌ Cancel ${j.label}`, `cancel_job:${token}`)]);
  }

  ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons),
  });
});

// ── cancel_job action (from /jobs inline buttons) ─────────────────────────────

bot.action(/^cancel_job:(.+)$/, async ctx => {
  const token  = ctx.match[1];
  const jobKey = cancelTokens.get(token);
  cancelTokens.delete(token);

  await ctx.answerCbQuery();

  if (!jobKey) {
    try { await ctx.editMessageText('Job no longer active.', { reply_markup: { inline_keyboard: [] } }); } catch {}
    return;
  }

  const job = activeJobs.get(jobKey);
  if (!job) {
    try { await ctx.editMessageText('Job already completed.', { reply_markup: { inline_keyboard: [] } }); } catch {}
    return;
  }

  job.cancelled = true;
  try { job.child?.kill('SIGTERM'); } catch {}
  activeJobs.delete(jobKey);

  const jobUrl = jobKey.split(':').slice(1).join(':');
  try {
    await ctx.editMessageText(`Cancelled: ${esc(job.label)} for ${esc(jobUrl)}`, { reply_markup: { inline_keyboard: [] } });
  } catch {}
});

// ── /cancel (typed usage) ─────────────────────────────────────────────────────

bot.command('cancel', async ctx => {
  const url = ctx.message.text.split(' ')[1]?.trim();

  if (!url) {
    if (activeJobs.size === 0) return ctx.reply('No active jobs.');
    const lines = [...activeJobs.entries()].map(([key, j]) => `• ${j.label} — ${key.split(':').slice(1).join(':')}`);
    return ctx.reply(`Cancellable jobs:\n${lines.join('\n')}\n\nUsage: /cancel <url>`);
  }

  const reconKey   = `recon:${url}`;
  const extractKey = `extract:${url}`;
  const jobKey     = activeJobs.has(reconKey) ? reconKey : activeJobs.has(extractKey) ? extractKey : null;

  if (!jobKey) return ctx.reply(`No active job for ${url}`);

  const job = activeJobs.get(jobKey);
  job.cancelled = true;
  try { job.child?.kill('SIGTERM'); } catch (e) {
    console.error(JSON.stringify({ phase: 'cancel', url, error: e.message }));
  }
  activeJobs.delete(jobKey);
  await ctx.reply(`Cancelled: ${job.label} for ${url}`);
});

// ── /clearjobs ────────────────────────────────────────────────────────────────

bot.command('clearjobs', async ctx => {
  let killed = 0;
  for (const [key, job] of activeJobs.entries()) {
    job.cancelled = true;
    try { job.child?.kill('SIGTERM'); } catch {}
    activeJobs.delete(key);
    killed++;
  }
  pendingExtracts.clear();

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

// ── /queue ────────────────────────────────────────────────────────────────────

bot.command('queue', async ctx => {
  const args  = ctx.message.text.split(' ').slice(1);
  const first = args[0]?.trim() ?? '';

  if (first.toLowerCase() === 'clear') {
    const q       = readQueue();
    const removed = q.filter(j => j.status === 'pending').length;
    writeQueue(q.filter(j => j.status !== 'pending'));
    return ctx.reply(`Removed ${removed} pending job${removed !== 1 ? 's' : ''}. Running job (if any) not affected.`);
  }

  if (first.startsWith('http')) {
    const url = first;
    const q   = readQueue();
    const dup = q.find(j => j.url === url && (j.status === 'pending' || j.status === 'running'));
    if (dup) return ctx.reply(`Already in queue:\n${url}`);

    q.push({ url, addedAt: new Date().toISOString(), status: 'pending' });
    writeQueue(q);

    const pending = q.filter(j => j.status === 'pending').length;
    const running = q.some(j => j.status === 'running');

    await ctx.reply(
      `✅ <b>Queued</b> — position ${pending}\n<code>${esc(url)}</code>\n\n` +
      (running ? `▶️ Job running — starts when current finishes.` : `No job running — starting now...`),
      { parse_mode: 'HTML' }
    );

    if (!running) processQueue(ctx.chat.id);
    return;
  }

  // No args — show queue status
  const q      = readQueue();
  const active = q.filter(j => j.status === 'running' || j.status === 'pending');
  const done   = q.filter(j => j.status === 'done' || j.status === 'failed').slice(-5);

  if (!active.length && !done.length) {
    return ctx.reply(
      'Queue is empty.\n\n' +
      'Add jobs:\n/queue https://store.dm2buy.com\n\n' +
      'Queue multiple stores — run overnight:\n' +
      '/queue https://store1.dm2buy.com\n' +
      '/queue https://store2.dm2buy.com\n\n' +
      '/queue clear — remove all pending'
    );
  }

  const sub = u => { try { return new URL(u).hostname.split('.')[0]; } catch { return u; } };
  const lines = [];

  active.forEach((j, i) => {
    const icon = j.status === 'running' ? '▶️' : `${i + 1}.`;
    lines.push(`${icon} <b>${esc(sub(j.url))}</b> — <i>${j.status}</i>`);
  });

  if (done.length) {
    lines.push('\n<i>Recent:</i>');
    done.slice().reverse().forEach(j => {
      lines.push(`${j.status === 'done' ? '✅' : '❌'} ${esc(sub(j.url))}`);
    });
  }

  const pending = q.filter(j => j.status === 'pending').length;
  await ctx.reply(
    `<b>📋 Queue</b> — ${active.length} active · ${pending} pending\n\n` +
    lines.join('\n') +
    `\n\n/queue clear — remove pending jobs`,
    { parse_mode: 'HTML' }
  );
});

// ── /recon ────────────────────────────────────────────────────────────────────

bot.command('recon', async ctx => {
  const url = ctx.message.text.split(' ')[1]?.trim();
  if (!url || !url.startsWith('http')) {
    return ctx.reply('Usage: /recon https://store.dm2buy.com');
  }

  const jobKey = `recon:${url}`;
  if (activeJobs.has(jobKey)) return ctx.reply(`Recon already running for ${url}`);

  activeJobs.set(jobKey, { startTime: Date.now(), label: 'recon', child: null });

  const child = spawn('node', ['scripts/recon_sample.js', url, '--count', '5'], {
    cwd: process.cwd(), env: process.env
  });
  activeJobs.get(jobKey).child = child;

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async (code, signal) => {
    const job = activeJobs.get(jobKey);
    activeJobs.delete(jobKey);
    if (signal || job?.cancelled) return;

    if (code !== 0) {
      return ctx.reply(`Recon failed:\n${stderr.slice(-500)}`);
    }

    const get = pattern => stdout.match(pattern)?.[1]?.trim() ?? '';
    const storeName   = get(/Store:\s+(.+)/);
    const instagram   = get(/Instagram:\s+@?(.+)/);
    const products    = parseInt(get(/Products:\s+(\d+)/), 10)    || 0;
    const collections = parseInt(get(/Collections:\s+(\d+)/), 10) || 0;
    const images      = parseInt(get(/Images:\s+(\d+)/), 10)      || 0;
    const estTime     = get(/Est\. import:\s+(.+)/);
    const date        = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    reconCache.set(url, { products, collections, images });

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
            { caption: `<b>${esc(storeName)}</b> — ${products} products · ${collections} collections · ${images} images`, parse_mode: 'HTML' }
          );
        } else {
          const summaryMatch = stdout.match(/━+[\s\S]*?━+/);
          await ctx.reply(summaryMatch?.[0]?.trim() ?? stdout.slice(0, 600));
        }
        resolve();
      });
    });

    const csvPath = findNewestFile('./output', '.csv');
    if (csvPath) {
      await ctx.replyWithDocument({ source: csvPath, filename: path.basename(csvPath) });
    }

    // ▶️ Full Extract button — no need to retype URL
    const token = Date.now().toString(36);
    pendingExtracts.set(token, url);
    await ctx.reply(
      `Ready to extract all <b>${products}</b> products?`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          Markup.button.callback('▶️ Full Extract', `confirm_extract:${token}`),
        ]),
      }
    );
  });
});

// ── /quote ────────────────────────────────────────────────────────────────────

bot.command('quote', async ctx => {
  const url = ctx.message.text.split(' ')[1]?.trim();
  if (!url || !url.startsWith('http')) {
    return ctx.reply('Usage: /quote https://store.dm2buy.com');
  }

  const jobKey = `recon:${url}`;
  if (activeJobs.has(jobKey)) return ctx.reply(`Recon already running for ${url}`);

  await ctx.reply(`🔍 Scanning <code>${esc(url)}</code>...`, { parse_mode: 'HTML' });

  activeJobs.set(jobKey, { startTime: Date.now(), label: 'quote-recon', child: null });

  const child = spawn('node', ['scripts/recon_sample.js', url, '--count', '5'], {
    cwd: process.cwd(), env: process.env
  });
  activeJobs.get(jobKey).child = child;

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async (code, signal) => {
    const job = activeJobs.get(jobKey);
    activeJobs.delete(jobKey);
    if (signal || job?.cancelled) return;

    if (code !== 0) return ctx.reply(`Recon failed:\n${stderr.slice(-400)}`);

    const get = pattern => stdout.match(pattern)?.[1]?.trim() ?? '';
    const storeName   = get(/Store:\s+(.+)/);
    const products    = parseInt(get(/Products:\s+(\d+)/), 10)    || 0;
    const collections = parseInt(get(/Collections:\s+(\d+)/), 10) || 0;
    const images      = parseInt(get(/Images:\s+(\d+)/), 10)      || 0;

    const price    = 500 + products * 10;
    const subdomain = (() => { try { return new URL(url).hostname.split('.')[0]; } catch { return url; } })();

    await ctx.reply(
      `<b>💬 Forward to client:</b>\n\n` +
      `Hi! 👋 Here's your Shoprift migration quote.\n\n` +
      `🏪 Store: ${subdomain}\n` +
      `📦 Products: ${products}\n` +
      `🗂 Collections: ${collections}\n` +
      `🖼 Images: ${images}\n\n` +
      `💰 Migration fee: <b>₹${price.toLocaleString('en-IN')}</b>\n\n` +
      `Includes:\n` +
      `• All products, variants & images\n` +
      `• Shopify-ready import file\n` +
      `• Google Drive delivery\n` +
      `• Post-import guide (~10 min to import)\n\n` +
      `Reply YES to confirm and I'll get started 🚀`,
      { parse_mode: 'HTML' }
    );
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

  const token = Date.now().toString(36);
  pendingExtracts.set(token, url);

  await ctx.reply(
    `Start full extraction for <code>${esc(url)}</code>?\nEst. 10–20 min.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        Markup.button.callback('✅ Yes, extract', `confirm_extract:${token}`),
        Markup.button.callback('❌ Cancel',        `cancel_extract:${token}`),
      ]),
    }
  );
});

// ── Queue persistence ─────────────────────────────────────────────────────────

const QUEUE_PATH = path.join(BOT_DIR, 'output', '_queue.json');

function readQueue() {
  try {
    if (!fs.existsSync(QUEUE_PATH)) return [];
    return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  } catch { return []; }
}

function writeQueue(q) {
  fs.mkdirSync(path.join(BOT_DIR, 'output'), { recursive: true });
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2), 'utf8');
}

function _queueJobDone(url, status, chatId) {
  const q = readQueue();
  const job = q.find(j => j.url === url && j.status === 'running');
  if (job) { job.status = status; writeQueue(q); }
  processQueue(chatId);
}

async function processQueue(chatId) {
  const q = readQueue();
  if (q.some(j => j.status === 'running')) return;
  const next = q.find(j => j.status === 'pending');
  if (!next) {
    const hasHistory = q.some(j => j.status === 'done' || j.status === 'failed');
    if (hasHistory) bot.telegram.sendMessage(chatId, '✅ Queue complete — all jobs processed.').catch(() => {});
    return;
  }
  next.status = 'running';
  writeQueue(q);
  const remaining = q.filter(j => j.status === 'pending').length;
  bot.telegram.sendMessage(chatId,
    `▶️ <b>Starting queued job</b>\n<code>${esc(next.url)}</code>\n<i>${remaining} job${remaining !== 1 ? 's' : ''} still pending</i>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
  runExtraction(next.url, chatId, { isQueue: true });
}

// ── runExtraction — shared extract logic for /extract + queue ─────────────────

async function runExtraction(url, chatId, opts = {}) {
  const { isQueue = false } = opts;
  const jobKey = `extract:${url}`;

  if (activeJobs.has(jobKey)) {
    bot.telegram.sendMessage(chatId, `Extraction already running for <code>${esc(url)}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    if (isQueue) _queueJobDone(url, 'failed', chatId);
    return;
  }

  activeJobs.set(jobKey, { startTime: Date.now(), label: 'extract', child: null, cancelled: false, chatId });

  const statusMsg   = await bot.telegram.sendMessage(chatId, '⏳ <b>Starting...</b>', { parse_mode: 'HTML' });
  const statusMsgId = statusMsg.message_id;
  activeJobs.get(jobKey).statusMsgId = statusMsgId;

  const child = spawn(
    'node',
    ['src/index.js', url, '--zip', '--yes', '--auto-approve'],
    { cwd: process.cwd(), env: process.env }
  );
  activeJobs.get(jobKey).child = child;

  let stdout = '', stderr = '';
  let progressLineBuffer = '';
  let lastProgressSent   = 0;
  const PROGRESS_THROTTLE_MS = 30_000;

  const MILESTONE_PATTERNS = [
    /✅ Recon complete/,
    /✅ Extraction complete/,
    /✅ Images downloaded/,
    /✅ CSV exported/,
    /🎉 Shoprift complete/,
  ];

  child.stdout.on('data', d => {
    const chunk = d.toString();
    stdout += chunk;
    progressLineBuffer += chunk;

    const lines = progressLineBuffer.split('\n');
    progressLineBuffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const isMilestone = MILESTONE_PATTERNS.some(p => p.test(trimmed));
      const isProgress  = trimmed.includes('⏳');
      const now         = Date.now();

      if (isMilestone) {
        bot.telegram.editMessageText(chatId, statusMsgId, undefined, trimmed, { parse_mode: 'HTML' }).catch(() => {});
      } else if (isProgress && now - lastProgressSent > PROGRESS_THROTTLE_MS) {
        lastProgressSent = now;
        const match = trimmed.match(/\((\d+)\/(\d+)\)/);
        if (match) {
          const [, cur, tot] = match;
          const phase = trimmed.includes('Extracting') ? 'Extracting' : 'Downloading';
          const bar   = progressBar(parseInt(cur), parseInt(tot));
          bot.telegram.editMessageText(chatId, statusMsgId, undefined,
            `⏳ <b>${phase}</b>\n${bar} (${cur}/${tot})`, { parse_mode: 'HTML' }).catch(() => {});
        }
      }
    }
  });

  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async (code, signal) => {
    const job = activeJobs.get(jobKey);
    activeJobs.delete(jobKey);

    if (signal || job?.cancelled) return;

    if (code !== 0) {
      const tail = (stdout + stderr).slice(-800);
      bot.telegram.sendMessage(chatId, `Extraction failed:\n${tail}`).catch(() => {});
      if (isQueue) _queueJobDone(url, 'failed', chatId);
      return;
    }

    let outputDir = null;
    if (fs.existsSync('./output')) {
      const subdirs = fs.readdirSync('./output')
        .filter(d => !d.startsWith('_') && !d.startsWith('.'))
        .map(d => path.join('./output', d))
        .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } })
        .map(d => ({ d, mtime: fs.statSync(d).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (subdirs[0]) outputDir = subdirs[0].d;
    }

    if (!outputDir) {
      bot.telegram.sendMessage(chatId, `Extraction done but output folder not found. Check output/.\n\nLog tail:\n${stdout.slice(-500)}`).catch(() => {});
      if (isQueue) _queueJobDone(url, 'failed', chatId);
      return;
    }

    const folderName   = path.basename(outputDir);
    const clientName   = clientNameFromUrl(url);
    const driveEnabled = process.env.GOOGLE_OAUTH_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (driveEnabled) {
      bot.telegram.editMessageText(chatId, statusMsgId, undefined, '☁️ <b>Uploading to Drive...</b>', { parse_mode: 'HTML' }).catch(() => {});

      try {
        const { url: driveUrl } = await uploadFolderToDrive(outputDir, folderName);
        driveUrlCache.set(url, driveUrl);

        bot.telegram.editMessageText(chatId, statusMsgId, undefined, '✅ <b>Done</b>', { parse_mode: 'HTML' }).catch(() => {});
        bot.telegram.sendMessage(chatId, `📁 <code>${esc(folderName)}</code>\n🔗 ${esc(driveUrl)}`, { parse_mode: 'HTML' }).catch(() => {});
        bot.telegram.sendMessage(chatId,
          `✏️ Edit name, then forward to client:\n\n` +
          `Hey ${clientName}, your Shoprift delivery is ready.\n\n` +
          `📁 ${driveUrl}\n\n` +
          `Also sharing your payment receipt shortly.\n\n` +
          `Open README.txt first — it walks you through everything. Takes ~10 min to import.`
        ).catch(() => {});
        const bareUrl = url.replace(/^https?:\/\//, '');
        bot.telegram.sendMessage(chatId, `🧾 Send receipt when ready:\n\n/receipt "${clientName}" ${bareUrl} <amount> <upi-ref>`).catch(() => {});

        if (isQueue) _queueJobDone(url, 'done', chatId);

      } catch (e) {
        console.error(JSON.stringify({ phase: 'drive_upload', url, error: e.message }));
        const retryToken = Date.now().toString(36);
        retryUploads.set(retryToken, { outputDir, folderName, url });
        bot.telegram.editMessageText(chatId, statusMsgId, undefined, '❌ <b>Drive upload failed</b>', { parse_mode: 'HTML' }).catch(() => {});
        bot.telegram.sendMessage(chatId,
          `Drive upload failed: ${e.message}\n\nFiles saved locally at:\n${outputDir}`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Retry Upload', `retry_upload:${retryToken}`)]])
        ).catch(() => {});
        if (isQueue) _queueJobDone(url, 'failed', chatId);
      }
      return;
    }

    // Fallback (no Drive): send ZIP via Telegram
    const zipPath = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('_delivery.zip'))
      .map(f => path.join(outputDir, f))[0] ?? null;

    if (!zipPath) {
      bot.telegram.sendMessage(chatId, `Extraction done. Files at:\n${outputDir}\n\nSet GOOGLE_OAUTH_* env vars for auto-upload.`).catch(() => {});
      if (isQueue) _queueJobDone(url, 'done', chatId);
      return;
    }

    const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);

    if (parseFloat(sizeMb) > 49) {
      bot.telegram.sendMessage(chatId,
        `Extraction complete — ${sizeMb} MB ZIP\n` +
        `Too large for Telegram. Add GOOGLE_OAUTH_* env vars for auto-upload.\n\n` +
        `File at:\n${zipPath}`
      ).catch(() => {});
      if (isQueue) _queueJobDone(url, 'done', chatId);
      return;
    }

    bot.telegram.sendMessage(chatId, `Extraction complete (${sizeMb} MB). Sending ZIP...`).catch(() => {});
    bot.telegram.sendDocument(chatId, { source: zipPath, filename: path.basename(zipPath) }).catch(() => {});
    if (isQueue) _queueJobDone(url, 'done', chatId);
  });
}

// ── confirm_extract action ────────────────────────────────────────────────────

bot.action(/^confirm_extract:(.+)$/, async ctx => {
  const token = ctx.match[1];
  const url   = pendingExtracts.get(token);
  if (!url) {
    await ctx.answerCbQuery('Session expired — run /extract again.');
    return;
  }

  const jobKey = `extract:${url}`;
  if (activeJobs.has(jobKey)) {
    await ctx.answerCbQuery();
    try { await ctx.editMessageText(`Extraction already running for ${esc(url)}`, { reply_markup: { inline_keyboard: [] } }); } catch {}
    return;
  }

  pendingExtracts.delete(token);
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `Extraction started for <code>${esc(url)}</code>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
    );
  } catch {}

  runExtraction(url, ctx.chat.id);
});

// ── cancel_extract action ─────────────────────────────────────────────────────

bot.action(/^cancel_extract:(.+)$/, async ctx => {
  const token = ctx.match[1];
  const url   = pendingExtracts.get(token);
  pendingExtracts.delete(token);

  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      url ? `Extraction cancelled for ${esc(url)}.` : 'Extraction cancelled.',
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch {}
});

// ── retry_upload action ───────────────────────────────────────────────────────

bot.action(/^retry_upload:(.+)$/, async ctx => {
  const token   = ctx.match[1];
  const pending = retryUploads.get(token);
  retryUploads.delete(token);

  await ctx.answerCbQuery();

  if (!pending) {
    try { await ctx.editMessageText('Retry expired — run /extract again.', { reply_markup: { inline_keyboard: [] } }); } catch {}
    return;
  }

  const { outputDir, folderName, url } = pending;
  try { await ctx.editMessageText('🔄 Retrying Drive upload...', { reply_markup: { inline_keyboard: [] } }); } catch {}

  try {
    const { url: driveUrl } = await uploadFolderToDrive(outputDir, folderName);
    driveUrlCache.set(url, driveUrl);
    const clientName = clientNameFromUrl(url);

    await ctx.reply(`📁 <code>${esc(folderName)}</code>\n🔗 ${esc(driveUrl)}`, { parse_mode: 'HTML' });
    await ctx.reply(
      `✏️ Edit name, then forward to client:\n\n` +
      `Hey ${clientName}, your Shoprift delivery is ready.\n\n` +
      `📁 ${driveUrl}\n\n` +
      `Also sharing your payment receipt shortly.\n\n` +
      `Open README.txt first — it walks you through everything. Takes ~10 min to import.`
    );
    const bareUrl = url.replace(/^https?:\/\//, '');
    await ctx.reply(`🧾 Send receipt when ready:\n\n/receipt "${clientName}" ${bareUrl} <amount> <upi-ref>`);

  } catch (e) {
    const retryToken2 = Date.now().toString(36);
    retryUploads.set(retryToken2, { outputDir, folderName, url });
    await ctx.reply(
      `Drive upload failed again: ${e.message}`,
      Markup.inlineKeyboard([[Markup.button.callback('🔄 Retry Upload', `retry_upload:${retryToken2}`)]])
    );
  }
});

// ── /receipt ──────────────────────────────────────────────────────────────────

bot.command('receipt', async ctx => {
  const text  = ctx.message.text.replace('/receipt', '').trim();
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
  const cached    = reconCache.get(`https://${storeUrl}`) || reconCache.get(storeUrl) || {};
  const receiptNo = nextReceiptNumber();
  const date      = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const payload = JSON.stringify({
    receiptNo, date, clientName, storeUrl, amount, upiRef,
    products:    cached.products    ?? 0,
    collections: cached.collections ?? 0,
    images:      cached.images      ?? 0,
  });

  const child = spawn('node', [path.join(BOT_DIR, 'scripts/generate_receipt.js'), payload], {
    cwd: process.cwd(), env: process.env
  });

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', async code => {
    if (code !== 0) return ctx.reply(`Receipt failed:\n${stderr.slice(-400)}`);
    const pdfPath = stdout.trim();
    if (!pdfPath || !fs.existsSync(pdfPath)) return ctx.reply(`PDF not found at: ${pdfPath}`);
    const filename = `shoprift-receipt-${receiptNo.split('/').pop().toLowerCase()}.pdf`;
    await ctx.replyWithDocument({ source: pdfPath, filename });

    // Write to Supabase payment ledger (fire-and-forget)
    if (supabase) {
      const driveUrl = driveUrlCache.get(`https://${storeUrl}`) || driveUrlCache.get(storeUrl) || null;
      supabase.from('payment_receipts').insert({
        receipt_no:  receiptNo,
        date,
        client_name: clientName,
        store_url:   storeUrl,
        amount_inr:  parseInt(amount, 10),
        upi_ref:     upiRef,
        products:    cached.products    ?? 0,
        collections: cached.collections ?? 0,
        images:      cached.images      ?? 0,
        drive_url:   driveUrl,
      }).catch(e => console.error(JSON.stringify({ phase: 'receipt_ledger', error: e.message })));
    }
  });
});

// ── /redeliver ────────────────────────────────────────────────────────────────

bot.command('redeliver', async ctx => {
  const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!arg) {
    return ctx.reply('Usage: /redeliver SRFT/2026-27/R001\nFind receipt number in /history.');
  }

  if (!supabase) return ctx.reply('Supabase not configured.');

  // Normalize: user might type R001 or SRFT/2026-27/R001
  const receiptNo = arg.includes('/') ? arg : null;
  if (!receiptNo) {
    return ctx.reply(`Receipt number must include slashes: e.g. SRFT/2026-27/R001\nYou sent: ${arg}`);
  }

  const { data, error } = await supabase
    .from('payment_receipts')
    .select('*')
    .eq('receipt_no', receiptNo)
    .single();

  if (error || !data) {
    return ctx.reply(`Receipt <code>${esc(receiptNo)}</code> not found.\nCheck spelling or use /history.`, { parse_mode: 'HTML' });
  }

  if (!data.drive_url) {
    return ctx.reply(
      `Receipt found — but Drive URL was not recorded for this job.\n\n` +
      `<b>Client:</b> ${esc(data.client_name)}\n` +
      `<b>Store:</b> ${esc(data.store_url)}\n` +
      `<b>Date:</b> ${esc(data.date)}\n\n` +
      `Drive URL is only saved for jobs done after the /redeliver feature was added.\n` +
      `Check your Google Drive manually for folder matching the store name.`,
      { parse_mode: 'HTML' }
    );
  }

  await ctx.reply(
    `📁 <b>Redelivery — ${esc(data.receipt_no)}</b>\n\n` +
    `Client: ${esc(data.client_name)}\n` +
    `Store: ${esc(data.store_url)}\n` +
    `Date: ${esc(data.date)}\n\n` +
    `✏️ Edit name, then forward:\n\n` +
    `Hey ${esc(data.client_name)}, here's your Shoprift delivery link again.\n\n` +
    `📁 ${esc(data.drive_url)}\n\n` +
    `Open README.txt first — it walks you through everything. Takes ~10 min to import.`,
    { parse_mode: 'HTML' }
  );
});

// ── /export ───────────────────────────────────────────────────────────────────

async function sendExport(ctx) {
  if (!supabase) return ctx.reply('Supabase not configured.');

  const { data, error } = await supabase
    .from('payment_receipts')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return ctx.reply(`Failed: ${error.message}`);
  if (!data?.length) return ctx.reply('No transactions yet.');

  const header = ['Receipt No', 'Date', 'Client', 'Store URL', 'Amount (₹)', 'UPI Ref', 'Products', 'Collections', 'Images', 'Drive URL'].join(',');
  const rows   = data.map(r => [
    r.receipt_no, r.date, `"${(r.client_name ?? '').replace(/"/g, '""')}"`,
    r.store_url, r.amount_inr, r.upi_ref, r.products, r.collections, r.images,
    r.drive_url ?? '',
  ].join(','));

  const csv      = [header, ...rows].join('\n');
  const today    = new Date().toISOString().slice(0, 10);
  const tmpPath  = path.join(BOT_DIR, 'output', `shoprift-payments-${today}.csv`);

  fs.mkdirSync(path.join(BOT_DIR, 'output'), { recursive: true });
  fs.writeFileSync(tmpPath, csv, 'utf8');

  await ctx.replyWithDocument(
    { source: tmpPath, filename: `shoprift-payments-${today}.csv` },
    { caption: `${data.length} transactions · exported ${today}` }
  );

  fs.unlink(tmpPath, () => {});
}

bot.command('export', ctx => sendExport(ctx));

// ── Shared report logic (used by commands + keyboard buttons) ─────────────────

async function sendHistory(ctx) {
  if (!supabase) return ctx.reply('Supabase not configured.');

  const { data, error } = await supabase
    .from('payment_receipts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return ctx.reply(`Failed: ${error.message}`);
  if (!data?.length) return ctx.reply('No transactions yet. Send /receipt to record one.');

  const total = data.reduce((sum, r) => sum + r.amount_inr, 0);
  const lines = data.map(r => {
    const d    = new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const no   = r.receipt_no.split('/').pop();
    const name = r.client_name.length > 12 ? r.client_name.slice(0, 11) + '…' : r.client_name.padEnd(12);
    return `${no}  ${name}  ₹${String(r.amount_inr).padStart(5)}  ${d}`;
  });

  await ctx.reply(
    `<b>🧾 Last ${data.length} Transactions</b>\n\n` +
    `<code>${lines.join('\n')}</code>\n\n` +
    `<b>Total: ₹${total.toLocaleString('en-IN')}</b> across ${data.length} job${data.length > 1 ? 's' : ''}`,
    { parse_mode: 'HTML' }
  );
}

async function sendReport(ctx, period = 'week') {
  if (!supabase) return ctx.reply('Supabase not configured.');

  const now = new Date();
  let from, periodLabel;

  if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    periodLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } else {
    from = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const s = new Date(now - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const e = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    periodLabel = `${s} – ${e}`;
  }

  const { data, error } = await supabase
    .from('payment_receipts')
    .select('*')
    .gte('created_at', from)
    .order('created_at', { ascending: false });

  if (error) return ctx.reply(`Failed: ${error.message}`);
  if (!data?.length) return ctx.reply(`No transactions for ${period === 'month' ? 'this month' : 'the last 7 days'}.`);

  const total = data.reduce((sum, r) => sum + r.amount_inr, 0);
  const avg   = Math.round(total / data.length);
  const max   = Math.max(...data.map(r => r.amount_inr));
  const lines = data.map(r => {
    const d    = new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const name = r.client_name.length > 12 ? r.client_name.slice(0, 11) + '…' : r.client_name.padEnd(12);
    return `${name}  ₹${String(r.amount_inr).padStart(5)}  ${d}`;
  });

  await ctx.reply(
    `<b>📊 ${period === 'month' ? 'Monthly' : 'Weekly'} Report</b>\n` +
    `<i>${periodLabel}</i>\n\n` +
    `Revenue   <b>₹${total.toLocaleString('en-IN')}</b>\n` +
    `Jobs      <b>${data.length}</b>\n` +
    `Avg/job   ₹${avg.toLocaleString('en-IN')}\n` +
    `Highest   ₹${max.toLocaleString('en-IN')}\n\n` +
    `<code>──────────────────────\n${lines.join('\n')}</code>`,
    { parse_mode: 'HTML' }
  );
}

// ── /history · /report ────────────────────────────────────────────────────────

bot.command('history', ctx => sendHistory(ctx));
bot.command('report',  ctx => {
  const arg = ctx.message.text.split(' ')[1]?.trim().toLowerCase() ?? 'week';
  return sendReport(ctx, arg);
});

// ── Keyboard button handlers ──────────────────────────────────────────────────

bot.hears('🔍 Recon',   ctx => ctx.reply('Send:\n/recon https://store.dm2buy.com'));
bot.hears('▶️ Extract', ctx => ctx.reply('Send:\n/extract https://store.dm2buy.com'));
bot.hears('🧾 Receipt', ctx => ctx.reply('Send:\n/receipt "Client Name" store-url amount upi-ref'));
bot.hears('📊 Weekly',  ctx => sendReport(ctx, 'week'));
bot.hears('📅 Monthly', ctx => sendReport(ctx, 'month'));
bot.hears('🗂 History', ctx => sendHistory(ctx));
bot.hears('📋 Jobs',    ctx => {
  if (activeJobs.size === 0) return ctx.reply('No active jobs.');
  const lines   = [];
  const buttons = [];
  for (const [key, j] of activeJobs.entries()) {
    const mins   = Math.round((Date.now() - j.startTime) / 60000);
    const jobUrl = key.split(':').slice(1).join(':');
    lines.push(`• <b>${esc(j.label)}</b> — <code>${esc(jobUrl)}</code> (${mins}m)`);
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    cancelTokens.set(token, key);
    buttons.push([Markup.button.callback(`❌ Cancel ${j.label}`, `cancel_job:${token}`)]);
  }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});
bot.hears('📤 Export',  ctx => sendExport(ctx));
bot.hears('🗓 Queue',   async ctx => {
  const q      = readQueue();
  const active = q.filter(j => j.status === 'running' || j.status === 'pending');
  if (!active.length) return ctx.reply('Queue is empty.\n\nAdd a job:\n/queue https://store.dm2buy.com');
  const sub   = u => { try { return new URL(u).hostname.split('.')[0]; } catch { return u; } };
  const lines = active.map((j, i) => {
    const icon = j.status === 'running' ? '▶️' : `${i + 1}.`;
    return `${icon} <b>${esc(sub(j.url))}</b> — <i>${j.status}</i>`;
  });
  const pending = q.filter(j => j.status === 'pending').length;
  return ctx.reply(
    `<b>📋 Queue</b> — ${active.length} active · ${pending} pending\n\n` + lines.join('\n') +
    `\n\n/queue clear — remove pending`,
    { parse_mode: 'HTML' }
  );
});
bot.hears('❓ Help',        ctx => ctx.reply(HELP_TEXT, { parse_mode: 'HTML', ...MAIN_KEYBOARD }));
bot.hears('✖ Close keyboard', ctx => ctx.reply('Keyboard hidden. Send /start to bring it back.', Markup.removeKeyboard()));

// ── unknown command ───────────────────────────────────────────────────────────

bot.on('text', ctx => {
  if (!ctx.message.text.startsWith('/')) return;
  ctx.reply('Unknown command. Send /start for help.');
});

// ── launch ────────────────────────────────────────────────────────────────────

bot.launch()
  .then(() => bot.telegram.setMyCommands([
    { command: 'recon',     description: 'Recon scan + 5-product sample CSV' },
    { command: 'extract',   description: 'Full extraction + Drive delivery' },
    { command: 'quote',     description: 'Price quote for client (runs recon)' },
    { command: 'queue',     description: 'Add to batch queue or show queue status' },
    { command: 'receipt',   description: 'Generate payment receipt PDF' },
    { command: 'redeliver', description: 'Resend Drive folder link by receipt number' },
    { command: 'export',    description: 'All payments as CSV file' },
    { command: 'history',   description: 'Last 10 transactions' },
    { command: 'report',    description: 'Weekly revenue report (/report month for monthly)' },
    { command: 'jobs',      description: 'Show active jobs with cancel buttons' },
    { command: 'cancel',    description: 'Cancel a running job' },
    { command: 'clearjobs', description: 'Kill all jobs + reset stuck Supabase jobs' },
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

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
