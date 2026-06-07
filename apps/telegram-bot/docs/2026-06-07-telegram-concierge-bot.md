# Telegram Concierge Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Telegram bot that wraps existing Shoprift CLI scripts so the founder can run recon scans and full extractions for concierge clients from any device (Mac desktop or iPhone).

**Architecture:** A single `bot.js` file at the project root uses the `telegraf` library to listen for commands. Each command spawns a child process running an existing script (`scripts/recon_sample.js` or `src/index.js`). The bot runs locally on the founder's Mac (`node bot.js`) — not deployed to Railway or Vercel. Jobs run concurrently via Node's event loop; a simple in-memory Map tracks active jobs.

**Tech Stack:** Node.js 24, `telegraf` v4 (Telegram Bot API wrapper), `child_process.spawn` (Node built-in), Playwright (already installed — renders receipt HTML → PDF), existing `scripts/recon_sample.js` + `src/index.js`

---

## Concierge Workflow (what the bot supports)

```
Step 1 — Client contacts you
Step 2 — You run: /recon https://store.dm2buy.com
         Bot replies: summary text + sample_5products.csv
Step 3 — Client reviews sample CSV
Step 4 — Price agreed
Step 5 — You share payment QR + concierge-terms-v1.md
Step 6 — After payment, you run: /extract https://store.dm2buy.com
         Bot runs full job (10–20 min) → replies with delivery.zip
         You also run: /receipt "Client Name" 800 UPI-REF-123
         Bot replies with formatted receipt text
```

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `bot.js` | **Create** | Main bot: auth, command routing, child process spawning, job tracking, recon cache |
| `scripts/generate_recon_summary.js` | **Create** | Injects recon data into summary template → Playwright screenshot → JPG |
| `scripts/generate_receipt.js` | **Create** | Injects data into receipt template → Playwright renders → PDF |
| `docs/legal/recon-template.html` | **Create** | Standalone 480×480 card HTML (extracted from `recon-summary.html`, no edit panel) |
| `docs/legal/receipt-template.html` | **Create** | Standalone receipt card HTML (extracted from `payment-receipt.html`, no edit panel) |
| `src/index.js` | **Modify** | Add `--yes` flag to skip interactive "Continue with import?" prompt |
| `.env` / `.env.example` | **Modify** | Add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_AUTHORIZED_CHAT_ID` |
| `package.json` | **Modify** | Add `telegraf` dependency + `"bot": "node bot.js"` script |

No new directories needed. Bot output files go to `./output/` (same as CLI).

---

## Task 1: BotFather Setup + Environment

> Manual steps — no code. Do this first so you have the token before writing code.

- [ ] **Step 1: Create the bot**

  Open Telegram → search `@BotFather` → send `/newbot`
  - Name: `Shoprift Concierge`
  - Username: `shoprift_concierge_bot` (or any available name ending in `_bot`)
  - BotFather replies with a token like: `7234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
  - Copy it — this is `TELEGRAM_BOT_TOKEN`

- [ ] **Step 2: Get your chat ID**

  Search `@userinfobot` on Telegram → send `/start`
  It replies with your chat ID (a number like `123456789`)
  This is `TELEGRAM_AUTHORIZED_CHAT_ID`

- [ ] **Step 3: Add env vars to `.env`**

  ```bash
  TELEGRAM_BOT_TOKEN=7234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TELEGRAM_AUTHORIZED_CHAT_ID=123456789
  ```

  Add the same keys (without values) to `.env.example`:
  ```bash
  TELEGRAM_BOT_TOKEN=
  TELEGRAM_AUTHORIZED_CHAT_ID=
  ```

- [ ] **Step 4: No commit yet** — `.env` is gitignored. Only commit `.env.example` change.

---

## Task 2: Install telegraf + update package.json

- [ ] **Step 1: Install telegraf**

  ```bash
  npm install telegraf
  ```

  Expected: `added 1 package` (telegraf has minimal deps)

- [ ] **Step 2: Add bot script to package.json**

  In `package.json`, add to `"scripts"`:
  ```json
  "bot": "node bot.js"
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "chore: add telegraf dependency + bot npm script"
  ```

---

## Task 3: Patch `src/index.js` — add `--yes` flag

The CLI currently prompts `Continue with import? (y/n):` (line ~208). When run as a bot child process, this blocks forever. Add `--yes` to skip it.

- [ ] **Step 1: Add `--yes` to `parseArgs`**

  In `src/index.js`, find `parseArgs` function. Add `yes: false` to the `result` object and parse it:

  ```js
  // In result object:
  yes: false,

  // In the for loop:
  } else if (arg === '--yes') {
    result.yes = true;
  }
  ```

- [ ] **Step 2: Thread `yes` through to `main`**

  In `main()`, destructure `yes` from `args`:
  ```js
  const { storeUrl, format: formatArg, zip, autoApprove, yes } = args;
  ```

- [ ] **Step 3: Skip confirmation prompt when `--yes` is set**

  Find the `prompt('Continue with import? (y/n): ')` block (~line 208). Replace:

  ```js
  const confirmed = await prompt('Continue with import? (y/n): ');
  if (!confirmed) {
    console.log('Import cancelled.');
    if (jobId) await job.failJob(jobId, 'Cancelled by user').catch(() => {});
    process.exit(0);
  }
  ```

  With:

  ```js
  if (!yes) {
    const confirmed = await prompt('Continue with import? (y/n): ');
    if (!confirmed) {
      console.log('Import cancelled.');
      if (jobId) await job.failJob(jobId, 'Cancelled by user').catch(() => {});
      process.exit(0);
    }
  }
  ```

- [ ] **Step 4: Test that CLI still works normally**

  ```bash
  node src/index.js https://kiwiishop.dm2buy.com
  ```
  Expected: still prompts `Continue with import? (y/n):` (flag not passed)

- [ ] **Step 5: Test `--yes` skips prompt**

  ```bash
  echo "" | node src/index.js https://kiwiishop.dm2buy.com --yes --auto-approve 2>&1 | head -20
  ```
  Expected: recon runs, no prompt, starts extraction immediately

- [ ] **Step 6: Commit**

  ```bash
  git add src/index.js
  git commit -m "feat(cli): add --yes flag to skip interactive confirmation (for bot use)"
  ```

---

## Task 4: Bot skeleton + auth

Create `bot.js` at project root.

- [ ] **Step 1: Write `bot.js`**

  ```js
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

  // Active jobs: url → { startTime, label }
  const activeJobs = new Map();

  /** Middleware: only allow authorized chat */
  function authOnly(ctx, next) {
    if (ctx.chat?.id !== AUTHORIZED_CHAT_ID) {
      return ctx.reply('Unauthorized.');
    }
    return next();
  }

  bot.use(authOnly);

  bot.command('start', ctx => {
    ctx.reply(
      `Shoprift Concierge Bot\n\n` +
      `/recon <url>   — recon scan + 5-product sample CSV\n` +
      `/extract <url> — full extraction + delivery ZIP\n` +
      `/receipt <"Client Name"> <amount> <upi-ref> — payment receipt\n` +
      `/jobs          — show active jobs\n\n` +
      `Example:\n` +
      `/recon https://store.dm2buy.com`
    );
  });

  bot.command('jobs', ctx => {
    if (activeJobs.size === 0) return ctx.reply('No active jobs.');
    const lines = [...activeJobs.entries()].map(([url, j]) => {
      const mins = Math.round((Date.now() - j.startTime) / 60000);
      return `• ${j.label} (${url}) — ${mins}m ago`;
    });
    ctx.reply(lines.join('\n'));
  });

  // Placeholder slots for commands (filled in next tasks)
  // bot.command('recon', ...)
  // bot.command('extract', ...)
  // bot.command('receipt', ...)

  bot.launch();
  console.log('Shoprift bot running. Send /start on Telegram.');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
  ```

- [ ] **Step 2: Run the bot**

  ```bash
  node bot.js
  ```
  Expected: `Shoprift bot running. Send /start on Telegram.`

- [ ] **Step 3: Test on Telegram**

  Send `/start` to your bot from your Telegram account.
  Expected: help text appears.
  Send `/start` from a different account (if possible) — expected: `Unauthorized.`

- [ ] **Step 4: Commit**

  ```bash
  git add bot.js
  git commit -m "feat(bot): skeleton + auth middleware + /start + /jobs"
  ```

---

## Task 5: `/recon` command — JPG summary card + CSV

The `/recon` command sends two things: a visual store summary JPG (from `recon-summary.html` design) and the 5-product sample CSV. No raw text block — the JPG replaces it.

### Step 5a: Create recon HTML template

- [ ] **Step 1: Create `docs/legal/recon-template.html`**

  This is the `.card` from `recon-summary.html` as a standalone 480×480 page. Edit panel removed. Data injected via `{{PLACEHOLDER}}` tokens.

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shoprift Store Summary</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 480px; height: 480px; overflow: hidden; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        background: #fff;
        -webkit-font-smoothing: antialiased;
      }
      .card {
        width: 480px; height: 480px;
        background: #fff;
        border-radius: 16px;
        overflow: hidden;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        display: flex;
        flex-direction: column;
      }
      .top-bar { background: #0a0b0f; padding: 20px 30px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
      .logo-lockup { display: flex; align-items: center; gap: 9px; }
      .wordmark { font-size: 18px; font-weight: 900; letter-spacing: -0.045em; color: #fff; }
      .summary-badge { font-size: 9.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #0a0b0f; background: #00E5A0; padding: 4px 10px; border-radius: 4px; }
      .meta-row { background: #f5f5f7; padding: 20px 30px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #e8e8ed; flex-shrink: 0; }
      .meta-left { display: flex; flex-direction: column; gap: 3px; }
      .store-name { font-size: 18px; font-weight: 900; color: #1a1a1e; letter-spacing: -0.03em; line-height: 1.2; }
      .store-instagram { font-size: 12px; color: #8a8a8e; font-weight: 500; }
      .meta-date { font-size: 11px; font-weight: 600; color: #8a8a8e; text-align: right; padding-top: 2px; }
      .card-body { flex: 1; display: flex; flex-direction: column; }
      .data-row { flex: 1; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; border-bottom: 1px solid #f0f0f2; }
      .data-row:last-child { border-bottom: none; }
      .row-label { font-size: 12px; font-weight: 500; color: #8a8a8e; display: flex; align-items: center; gap: 8px; }
      .row-label svg { color: #c0c0c8; flex-shrink: 0; }
      .row-value { font-size: 14px; font-weight: 700; color: #1a1a1e; letter-spacing: -0.01em; text-align: right; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .row-value.accent { color: #00C48A; }
      .card-footer { background: #f5f5f7; border-top: 1px solid #e8e8ed; padding: 13px 30px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .footer-brand { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #c0c0c8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="top-bar">
        <div class="logo-lockup">
          <svg width="26" height="26" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#00E5A0"/>
                <stop offset="100%" stop-color="#6B8AFF"/>
              </linearGradient>
            </defs>
            <path d="M 22 27 L 58 27 L 78 47 L 78 55 L 52 55 L 42 45 L 22 45 Z" fill="url(#sg)"/>
            <path d="M 98 93 L 62 93 L 42 73 L 42 65 L 68 65 L 78 75 L 98 75 Z" fill="url(#sg)"/>
            <path d="M 44 58 L 76 58 L 76 62 L 44 62 Z" fill="url(#sg)" opacity="0.6"/>
          </svg>
          <span class="wordmark">shoprift</span>
        </div>
        <div class="summary-badge">Store Summary</div>
      </div>

      <div class="meta-row">
        <div class="meta-left">
          <div class="store-name">{{STORE_NAME}}</div>
          <div class="store-instagram">{{INSTAGRAM}}</div>
        </div>
        <div class="meta-date">{{DATE}}</div>
      </div>

      <div class="card-body">
        <div class="data-row">
          <span class="row-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            dm2buy URL
          </span>
          <span class="row-value">{{STORE_URL}}</span>
        </div>
        <div class="data-row">
          <span class="row-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            Products
          </span>
          <span class="row-value accent">{{PRODUCTS}}</span>
        </div>
        <div class="data-row">
          <span class="row-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
            Collections
          </span>
          <span class="row-value accent">{{COLLECTIONS}}</span>
        </div>
        <div class="data-row">
          <span class="row-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Images
          </span>
          <span class="row-value accent">{{IMAGES}}</span>
        </div>
        <div class="data-row">
          <span class="row-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Est. Import Time
          </span>
          <span class="row-value">{{EST_TIME}}</span>
        </div>
      </div>

      <div class="card-footer">
        <span class="footer-brand">shoprift.app</span>
      </div>
    </div>
  </body>
  </html>
  ```

- [ ] **Step 2: Open template in browser to verify**

  ```bash
  open docs/legal/recon-template.html
  ```
  Expected: 480×480 card, same design as `recon-summary.html`.

### Step 5b: Create `scripts/generate_recon_summary.js`

- [ ] **Step 3: Write `scripts/generate_recon_summary.js`**

  ```js
  /**
   * scripts/generate_recon_summary.js
   * Renders recon summary card via Playwright → JPG (480×480).
   * Usage: node scripts/generate_recon_summary.js '<json-data>'
   * JSON shape: { storeName, instagram, storeUrl, products, collections, images, estTime, date }
   * Prints output path to stdout on success.
   */

  import 'dotenv/config';
  import fs from 'fs';
  import path from 'path';
  import { chromium } from 'playwright';

  const data = JSON.parse(process.argv[2] || '{}');
  const {
    storeName   = 'Store',
    instagram   = '',
    storeUrl    = '',
    products    = 0,
    collections = 0,
    images      = 0,
    estTime     = '—',
    date        = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  } = data;

  const templatePath = path.resolve('./docs/legal/recon-template.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html
    .replace(/\{\{STORE_NAME\}\}/g,   storeName)
    .replace(/\{\{INSTAGRAM\}\}/g,    instagram ? `@${instagram.replace(/^@/, '')}` : '')
    .replace(/\{\{STORE_URL\}\}/g,    storeUrl.replace(/^https?:\/\//, ''))
    .replace(/\{\{PRODUCTS\}\}/g,     String(products))
    .replace(/\{\{COLLECTIONS\}\}/g,  String(collections))
    .replace(/\{\{IMAGES\}\}/g,       String(images))
    .replace(/\{\{EST_TIME\}\}/g,     estTime)
    .replace(/\{\{DATE\}\}/g,         date);

  const outDir = './output/summaries';
  fs.mkdirSync(outDir, { recursive: true });

  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const jpgPath = path.resolve(`${outDir}/shoprift-store-${slug}.jpg`);

  const tmpHtml = path.resolve(`${outDir}/.summary_tmp.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 480, height: 480 });
    await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: jpgPath, type: 'jpeg', quality: 96, fullPage: false });
    console.log(jpgPath);
  } finally {
    await browser.close();
    fs.unlinkSync(tmpHtml);
  }
  ```

- [ ] **Step 4: Test the script manually**

  ```bash
  node scripts/generate_recon_summary.js '{"storeName":"Pookie Scoopee","instagram":"pookiescoopee_","storeUrl":"pookiescoopee.dm2buy.com","products":103,"collections":7,"images":247,"estTime":"~22 minutes"}'
  ```

  Expected: prints path `/.../output/summaries/shoprift-store-pookie-scoopee.jpg`

  ```bash
  open output/summaries/shoprift-store-pookie-scoopee.jpg
  ```
  Expected: 480×480 JPG, identical to manual download from `recon-summary.html`.

### Step 5c: Wire into bot

- [ ] **Step 5: Add helper + `/recon` handler to `bot.js`**

  Add helper (before `bot.launch()`):

  ```js
  function findNewestFile(dir, suffix) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith(suffix))
      .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] ? path.join(dir, files[0].f) : null;
  }
  ```

  Add `/recon` handler (after `/jobs`):

  ```js
  bot.command('recon', async ctx => {
    const url = ctx.message.text.split(' ')[1]?.trim();
    if (!url || !url.startsWith('http')) {
      return ctx.reply('Usage: /recon https://store.dm2buy.com');
    }

    const jobKey = `recon:${url}`;
    if (activeJobs.has(jobKey)) return ctx.reply(`Recon already running for ${url}`);

    activeJobs.set(jobKey, { startTime: Date.now(), label: 'recon' });
    await ctx.reply(`🔍 Running recon for ${url}...`);

    const child = spawn('node', ['scripts/recon_sample.js', url, '--count', '5'], {
      cwd: process.cwd(), env: process.env
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', async code => {
      activeJobs.delete(jobKey);

      if (code !== 0) {
        return ctx.reply(`❌ Recon failed:\n${stderr.slice(-500)}`);
      }

      // Parse recon data from stdout
      const get = (pattern) => stdout.match(pattern)?.[1]?.trim() ?? '';
      const storeName   = get(/Store:\s+(.+)/);
      const instagram   = get(/Instagram:\s+@?(.+)/);
      const products    = parseInt(get(/Products:\s+(\d+)/),    10) || 0;
      const collections = parseInt(get(/Collections:\s+(\d+)/),10) || 0;
      const images      = parseInt(get(/Images:\s+(\d+)/),      10) || 0;
      const estTime     = get(/Est\. import:\s+(.+)/);
      const date        = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

      // Cache for /receipt auto-fill
      reconCache.set(url, { products, collections, images });

      // Generate summary JPG
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
            const filename = `shoprift-store-${storeName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.jpg`;
            await ctx.replyWithPhoto({ source: jpgPath }, { caption: `${storeName} — ${products} products · ${collections} collections · ${images} images` });
          } else {
            // Fallback to text if image gen fails
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
        await ctx.reply('⚠️  CSV not found — check output/ folder manually.');
      }
    });
  });
  ```

- [ ] **Step 6: Test `/recon` full flow**

  Start bot: `node bot.js`
  Send: `/recon https://kiwiishop.dm2buy.com`
  Expected after ~20s:
  - 480×480 JPG photo of store summary card
  - Caption: "Kiwi Shop — 25 products · 5 collections · 63 images"
  - `kiwiishop_sample_5products.csv` file

- [ ] **Step 7: Test `/jobs` during recon**

  Send `/recon` then immediately `/jobs` — expected: shows active recon job.

- [ ] **Step 8: Commit**

  ```bash
  git add bot.js scripts/generate_recon_summary.js docs/legal/recon-template.html
  git commit -m "feat(bot): /recon sends store summary JPG card + sample CSV"
  ```

---

## Task 6: `/extract` command

- [ ] **Step 1: Add `/extract` command handler**

  Add after the `/recon` handler in `bot.js`:

  ```js
  bot.command('extract', async ctx => {
    const url = ctx.message.text.split(' ')[1]?.trim();
    if (!url || !url.startsWith('http')) {
      return ctx.reply('Usage: /extract https://store.dm2buy.com');
    }

    const jobKey = `extract:${url}`;
    if (activeJobs.has(jobKey)) return ctx.reply(`Extraction already running for ${url}`);

    activeJobs.set(jobKey, { startTime: Date.now(), label: 'extract' });
    await ctx.reply(`🚀 Starting extraction for ${url}\nThis takes 10–20 min. I'll send the ZIP when done.`);

    const child = spawn(
      'node',
      ['src/index.js', url, '--zip', '--yes', '--auto-approve'],
      { cwd: process.cwd(), env: process.env }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', async code => {
      activeJobs.delete(jobKey);

      if (code !== 0) {
        const tail = (stdout + stderr).slice(-800);
        await ctx.reply(`❌ Extraction failed:\n${tail}`);
        return;
      }

      // Find delivery ZIP in output subdirs
      let zipPath = null;
      if (fs.existsSync('./output')) {
        const subdirs = fs.readdirSync('./output')
          .map(d => path.join('./output', d))
          .filter(d => fs.statSync(d).isDirectory());
        const candidates = subdirs.flatMap(d =>
          fs.readdirSync(d)
            .filter(f => f.endsWith('_delivery.zip'))
            .map(f => ({ p: path.join(d, f), mtime: fs.statSync(path.join(d, f)).mtimeMs }))
        ).sort((a, b) => b.mtime - a.mtime);
        if (candidates[0]) zipPath = candidates[0].p;
      }

      if (!zipPath) {
        await ctx.reply(`✅ Extraction done but ZIP not found. Check output/ folder.\n\nLog tail:\n${stdout.slice(-500)}`);
        return;
      }

      const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);

      if (parseFloat(sizeMb) > 49) {
        await ctx.reply(
          `✅ Extraction complete.\n` +
          `ZIP is ${sizeMb} MB — too large for Telegram (50 MB limit).\n` +
          `File saved at: ${zipPath}`
        );
        return;
      }

      await ctx.reply(`✅ Extraction complete (${sizeMb} MB). Sending ZIP...`);
      await ctx.replyWithDocument({ source: zipPath, filename: path.basename(zipPath) });
    });
  });
  ```

- [ ] **Step 2: Test `/extract`**

  Start bot: `node bot.js`
  Send: `/extract https://kiwiishop.dm2buy.com`
  Expected:
  - Immediate reply: "Starting extraction..."
  - ~10–15 min later: delivery ZIP sent
  - ZIP contains `store_data.csv`, `migration_report.md`, `images/`, `README.txt`

- [ ] **Step 3: Test concurrent jobs**

  Send `/recon https://kiwiishop.dm2buy.com` then immediately `/recon https://mmshop.dm2buy.com`
  Expected: both run simultaneously, both send back results when done (out-of-order is fine)

- [ ] **Step 4: Commit**

  ```bash
  git add bot.js
  git commit -m "feat(bot): /extract command — runs full extraction, sends delivery ZIP"
  ```

---

## Task 7: `/receipt` command — PDF matching existing design

Uses your existing `docs/legal/payment-receipt.html` design. Playwright renders a server-side version → PDF. Same visual output as what you generate manually today.

**Command syntax:**
```
/receipt "Pookie Scoopee" pookiescoopee.dm2buy.com 800 UPI-REF-123
```
Products / collections / images auto-filled from the last `/recon` run for that store URL.

### Step 7a: Create receipt HTML template

- [ ] **Step 1: Create `docs/legal/receipt-template.html`**

  This is the `.card` from `payment-receipt.html` as a standalone server-renderable page. Data is injected via `{{PLACEHOLDER}}` tokens — no JavaScript needed, Playwright renders static HTML.

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shoprift Receipt</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        background: #f0f0f5;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 32px;
        -webkit-font-smoothing: antialiased;
      }
      .card {
        background: #fff;
        width: 100%;
        max-width: 460px;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid #e2e2e7;
        box-shadow: 0 2px 4px rgba(0,0,0,0.12), 0 12px 32px rgba(0,0,0,0.2);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .top-bar { background: #0a0b0f; padding: 22px 28px 20px; display: flex; align-items: center; justify-content: space-between; }
      .logo-lockup { display: flex; align-items: center; gap: 10px; }
      .wordmark { font-size: 21px; font-weight: 900; letter-spacing: -0.045em; color: #fff; }
      .paid-badge { font-size: 10.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #0a0b0f; background: #00E5A0; padding: 5px 11px; border-radius: 5px; }
      .meta-row { padding: 14px 28px; background: #f5f5f7; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e8e8ed; }
      .meta-item { display: flex; flex-direction: column; gap: 2px; }
      .meta-label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #8a8a8e; }
      .meta-value { font-size: 12.5px; font-weight: 700; color: #1a1a1e; }
      .body { padding: 24px 28px; }
      .section-label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #8a8a8e; margin-bottom: 5px; }
      .client-name { font-size: 16px; font-weight: 800; color: #1a1a1e; letter-spacing: -0.02em; margin-bottom: 2px; }
      .client-store { font-size: 12px; color: #8a8a8e; margin-bottom: 22px; }
      .service-block { background: #f5f5f7; border-radius: 8px; padding: 13px 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .service-desc { font-size: 13px; font-weight: 600; color: #1a1a1e; line-height: 1.4; }
      .service-desc span { display: block; font-size: 11px; color: #8a8a8e; font-weight: 400; margin-top: 3px; }
      .service-amount { font-size: 17px; font-weight: 900; color: #1a1a1e; letter-spacing: -0.03em; white-space: nowrap; }
      .payment-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-top: 1px solid #e8e8ed; }
      .payment-label { font-size: 12px; color: #8a8a8e; }
      .payment-value { font-size: 12px; font-weight: 600; color: #1a1a1e; }
      .total-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 0; border-top: 1.5px solid #1a1a1e; margin-top: 4px; }
      .total-label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1a1a1e; }
      .total-amount { font-size: 22px; font-weight: 900; color: #1a1a1e; letter-spacing: -0.04em; }
      .card-note { padding: 12px 28px 16px; font-size: 10.5px; color: #aaa; text-align: center; }
      .card-footer { background: #f5f5f7; border-top: 1px solid #e8e8ed; padding: 16px 28px; display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; }
      .contact-item { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; color: #8a8a8e; }
      .contact-item svg { flex-shrink: 0; opacity: 0.65; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="top-bar">
        <div class="logo-lockup">
          <svg width="30" height="30" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#00E5A0"/>
                <stop offset="100%" stop-color="#6B8AFF"/>
              </linearGradient>
            </defs>
            <path d="M 22 27 L 58 27 L 78 47 L 78 55 L 52 55 L 42 45 L 22 45 Z" fill="url(#sg)"/>
            <path d="M 98 93 L 62 93 L 42 73 L 42 65 L 68 65 L 78 75 L 98 75 Z" fill="url(#sg)"/>
            <path d="M 44 58 L 76 58 L 76 62 L 44 62 Z" fill="url(#sg)" opacity="0.6"/>
          </svg>
          <span class="wordmark">shoprift</span>
        </div>
        <div class="paid-badge">Paid</div>
      </div>

      <div class="meta-row">
        <div class="meta-item">
          <span class="meta-label">Receipt No.</span>
          <span class="meta-value">{{RECEIPT_NO}}</span>
        </div>
        <div class="meta-item" style="text-align:right;">
          <span class="meta-label">Date</span>
          <span class="meta-value">{{DATE}}</span>
        </div>
      </div>

      <div class="body">
        <div class="section-label">Received from</div>
        <div class="client-name">{{CLIENT_NAME}}</div>
        <div class="client-store">{{STORE_URL}}</div>

        <div class="service-block">
          <div class="service-desc">
            Store Migration Package
            <span>{{COUNTS}}</span>
          </div>
          <div class="service-amount">₹{{AMOUNT}}</div>
        </div>

        <div class="payment-row">
          <span class="payment-label">Payment method</span>
          <span class="payment-value">UPI — {{UPI_REF}}</span>
        </div>

        <div class="total-row">
          <span class="total-label">Total received</span>
          <span class="total-amount">₹{{AMOUNT}}</span>
        </div>
      </div>

      <div class="card-note">This is an acknowledgment of payment received. Not a tax invoice.</div>

      <div class="card-footer">
        <div class="contact-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
          </svg>
          support@shoprift.app
        </div>
        <div class="contact-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
          </svg>
          @shoprift_
        </div>
        <div class="contact-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          shoprift.app
        </div>
      </div>
    </div>
  </body>
  </html>
  ```

- [ ] **Step 2: Open template in browser to verify it looks correct**

  ```bash
  open docs/legal/receipt-template.html
  ```
  Expected: receipt card centered on page, same styling as `payment-receipt.html`.

### Step 7b: Create `scripts/generate_receipt.js`

- [ ] **Step 3: Write `scripts/generate_receipt.js`**

  ```js
  /**
   * scripts/generate_receipt.js
   * Renders receipt HTML template via Playwright → PDF.
   * Usage: node scripts/generate_receipt.js '<json-data>'
   * JSON shape: { receiptNo, date, clientName, storeUrl, amount, upiRef, products, collections, images }
   */

  import 'dotenv/config';
  import fs from 'fs';
  import path from 'path';
  import { chromium } from 'playwright';

  const data = JSON.parse(process.argv[2] || '{}');
  const {
    receiptNo = 'SRFT/2026-27/R001',
    date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    clientName = 'Client',
    storeUrl = '',
    amount = '0',
    upiRef = '',
    products = 0,
    collections = 0,
    images = 0,
  } = data;

  const counts = [
    products  ? `${products} products`    : null,
    collections ? `${collections} collections` : null,
    images    ? `${images} images`        : null,
  ].filter(Boolean).join(' · ') || 'Store Migration';

  const templatePath = path.resolve('./docs/legal/receipt-template.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html
    .replace(/\{\{RECEIPT_NO\}\}/g,  receiptNo)
    .replace(/\{\{DATE\}\}/g,         date)
    .replace(/\{\{CLIENT_NAME\}\}/g,  clientName)
    .replace(/\{\{STORE_URL\}\}/g,    storeUrl)
    .replace(/\{\{AMOUNT\}\}/g,       String(amount))
    .replace(/\{\{UPI_REF\}\}/g,      upiRef)
    .replace(/\{\{COUNTS\}\}/g,       counts);

  const slug = receiptNo.split('/').pop().toLowerCase();
  const outDir = './output/receipts';
  fs.mkdirSync(outDir, { recursive: true });
  const pdfPath = path.resolve(`${outDir}/shoprift-receipt-${slug}.pdf`);

  // Write populated HTML to temp file so Playwright can load it with file:// URL
  const tmpHtml = path.resolve(`${outDir}/.receipt_tmp.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'A5',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
    });
    console.log(pdfPath);  // bot reads this line to find the output path
  } finally {
    await browser.close();
    fs.unlinkSync(tmpHtml);
  }
  ```

- [ ] **Step 4: Test the script manually**

  ```bash
  node scripts/generate_receipt.js '{"receiptNo":"SRFT/2026-27/R001","clientName":"Pookie Scoopee","storeUrl":"pookiescoopee.dm2buy.com","amount":"800","upiRef":"UPI123456789","products":103,"collections":7,"images":247}'
  ```

  Expected: outputs path like `/.../output/receipts/shoprift-receipt-r001.pdf`

  ```bash
  open output/receipts/shoprift-receipt-r001.pdf
  ```
  Expected: PDF with exact same design as `payment-receipt.html`.

### Step 7c: Wire receipt into bot

- [ ] **Step 5: Add receipt counter + recon cache to `bot.js`**

  Add at top of `bot.js` after imports:

  ```js
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
    const yy = String(year).slice(2);
    const yyNext = String(year + 1).slice(2);
    return `SRFT/${year}-${yyNext}/R${String(n).padStart(3, '0')}`;
  }

  // Recon cache: storeUrl → { products, collections, images }
  const reconCache = new Map();
  ```

- [ ] **Step 6: Update `/recon` handler to populate cache**

  Inside the `/recon` handler's `child.on('close', ...)` success branch, after sending summary, add:

  ```js
  // Cache recon counts for use in /receipt
  const prodMatch  = stdout.match(/Products:\s+(\d+)/);
  const collMatch  = stdout.match(/Collections:\s+(\d+)/);
  const imgMatch   = stdout.match(/Images:\s+(\d+)/);
  if (prodMatch) {
    reconCache.set(url, {
      products:    parseInt(prodMatch[1], 10),
      collections: parseInt(collMatch?.[1] ?? '0', 10),
      images:      parseInt(imgMatch?.[1]  ?? '0', 10),
    });
  }
  ```

- [ ] **Step 7: Add `/receipt` command handler to `bot.js`**

  ```js
  bot.command('receipt', async ctx => {
    // /receipt "Client Name" store.dm2buy.com 800 UPI-REF
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

    await ctx.reply(`🧾 Generating receipt ${receiptNo}...`);

    const child = spawn('node', ['scripts/generate_receipt.js', payload], {
      cwd: process.cwd(), env: process.env
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', async code => {
      if (code !== 0) {
        return ctx.reply(`❌ Receipt failed:\n${stderr.slice(-400)}`);
      }
      const pdfPath = stdout.trim();
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        return ctx.reply(`❌ PDF not found at: ${pdfPath}`);
      }
      const filename = `shoprift-receipt-${receiptNo.split('/').pop().toLowerCase()}.pdf`;
      await ctx.replyWithDocument({ source: pdfPath, filename });
    });
  });
  ```

- [ ] **Step 8: Test full `/receipt` flow via bot**

  1. Send `/recon https://pookiescoopee.dm2buy.com` — wait for summary
  2. Send `/receipt "Pookie Scoopee" pookiescoopee.dm2buy.com 800 UPI123456789`
  Expected: PDF arrives in Telegram chat, matching your manual receipt design.

- [ ] **Step 9: Commit**

  ```bash
  git add bot.js scripts/generate_receipt.js docs/legal/receipt-template.html
  git commit -m "feat(bot): /receipt generates PDF via Playwright using existing receipt design"
  ```

---

## Task 8: Error polish + startup instructions

- [ ] **Step 1: Add unknown command handler**

  Add at end of `bot.js` (before `bot.launch()`):

  ```js
  bot.on('text', ctx => {
    if (!ctx.message.text.startsWith('/')) return; // ignore non-commands
    ctx.reply('Unknown command. Send /start for help.');
  });
  ```

- [ ] **Step 2: Add startup banner to `bot.js`**

  Replace the `console.log` after `bot.launch()`:

  ```js
  console.log(`
  ┌─────────────────────────────────┐
  │  Shoprift Concierge Bot         │
  │  Authorized chat: ${AUTHORIZED_CHAT_ID}    │
  │  Send /start on Telegram        │
  └─────────────────────────────────┘
  `);
  ```

- [ ] **Step 3: Add bot to `.gitignore` output guard**

  Verify `output/` is in `.gitignore` (it should be). Also verify `.env` is gitignored.
  ```bash
  grep -E "^output|^\.env$" .gitignore
  ```
  Expected: both lines present.

- [ ] **Step 4: End-to-end test — full concierge flow**

  Simulate a real client job:
  1. Send `/recon https://kiwiishop.dm2buy.com` → get summary + CSV ✓
  2. Send `/extract https://kiwiishop.dm2buy.com` → wait → get ZIP ✓
  3. Send `/receipt "Kiwi Shop" 800 UPI123456789` → get receipt ✓
  4. Send `/jobs` during extract → see active job ✓

- [ ] **Step 5: Final commit**

  ```bash
  git add bot.js .env.example
  git commit -m "feat(bot): error handling, startup banner, end-to-end verified"
  ```

---

## How to Run

```bash
# Start the bot (keep terminal open, or use a background tool)
node bot.js

# Or via npm script
npm run bot
```

**On iPhone:** Open Telegram → find your bot → send commands. Same bot, same responses.

**Keep it running while doing client work:** Use `npx pm2 start bot.js --name shoprift-bot` if you want it to survive terminal closes.

**Commands summary:**

| Command | What it does |
|---------|-------------|
| `/recon https://store.dm2buy.com` | Recon scan → summary text + 5-product CSV (15–30s) |
| `/extract https://store.dm2buy.com` | Full extraction → delivery ZIP (10–20 min) |
| `/receipt "Name" 800 UPI-REF` | Formatted payment receipt |
| `/jobs` | List active running jobs |
| `/start` | Help text |

---

## Skills — Task Map

> Invoke each skill BEFORE starting the task it covers. Do not skip — skills set execution discipline.

| Task | Skill | Why |
|------|-------|-----|
| **All tasks — execution mode** | `superpowers:subagent-driven-development` *(recommended)* | Dispatches fresh subagent per task, reviews between tasks. Keeps context clean across 8 tasks. |
| **All tasks — inline alternative** | `superpowers:executing-plans` | Use if staying in one session. Batch execution with checkpoints. |
| **Before marking any task done** | `superpowers:verification-before-completion` | Enforces "it actually works" check before checkbox. Prevents false-done. |
| **Task 3** — patch `src/index.js` | `caveman:cavecrew-builder` | Surgical 1-file edit. Hard-refuses scope creep beyond the `--yes` flag addition. |
| **Tasks 5b, 7b** — new scripts | `superpowers:test-driven-development` | Write failing test first, then implement. Catches Playwright render bugs early. |
| **Any Playwright / Telegraf failure** | `superpowers:systematic-debugging` | Structured root-cause isolation. Use when screenshot is blank, PDF is empty, or bot stops responding. |
| **After Task 8** — final review | `code-review` | Single-pass review of `bot.js` + both generator scripts for bugs and simplification. |
| **After code-review passes** | `superpowers:finishing-a-development-branch` | Final commit hygiene, branch cleanup, confirm nothing uncommitted. |

### Skill notes

- **`shoprift-pm`** — invoke if scope changes mid-build (new command, different workflow step)
- **`superpowers:writing-plans`** — used to write this plan; re-invoke if plan needs major revision
- Do NOT invoke `design`, `image-to-code-skill`, or `impeccable` — templates are extracted directly from existing HTML, no design work needed

---

## Notes for Implementer

- Bot runs **locally on founder's Mac** — not on Railway or Vercel
- All output files land in `./output/` as usual (same as CLI)
- `--yes` flag added to `src/index.js` does NOT break existing CLI usage — flag is opt-in
- Telegram file upload limit is 50 MB. For larger ZIPs, bot sends the file path instead
- Receipt counter persists in `./output/.receipt_counter.json` — survives bot restarts
- Multiple concurrent jobs work out of the box — each `spawn()` is independent
