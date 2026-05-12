# ERRORS.md — Shoprift Error Handling

> Part of the Shoprift document suite.
> Every known failure mode is defined here with exact handling instructions.
> Cross-reference: CLAUDE.md for where each handler is used. ARCHITECTURE.md for phase context.
> No error in Shoprift should ever be silent. Every failure must be logged and surfaced.

---

## CORE PRINCIPLE

```
Silent failures are worse than crashes.
A crash tells you something broke.
A silent failure gives you corrupt data.
Shoprift never swallows errors.
```

Every error must:
1. Log what broke, which phase, which URL, and why
2. Update the Supabase job record with the error
3. Either recover gracefully or fail loudly with a clear message
4. Never produce partial output that looks like complete output

---

## ERROR CATEGORIES

---

### E01 — INVALID URL

**Trigger:** User provides a URL that does not match `*.dm2buy.com` pattern

**Handler:**
```javascript
// In src/utils.js → isDm2buyUrl()
// In src/index.js → validate before creating job

if (!isDm2buyUrl(url)) {
  console.error('❌ Invalid URL. Shoprift only works with dm2buy stores.');
  console.error('   Expected format: https://yourstore.dm2buy.com');
  process.exit(1);
}
```

**No Supabase update needed** — job not created yet.

---

### E02 — STORE UNREACHABLE

**Trigger:** Playwright navigates to store URL but page fails to load (network error, DNS failure, 404, 500)

**Phase:** Recon (Phase 1)

**Handler:**
```javascript
try {
  await page.goto(storeUrl, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 });
} catch (error) {
  await job.failJob(jobId, `Store unreachable: ${error.message}`);
  console.error('❌ Cannot reach store. The dm2buy store may be down or the URL is incorrect.');
  console.error(`   URL attempted: ${storeUrl}`);
  console.error(`   Error: ${error.message}`);
  process.exit(1);
}
```

---

### E03 — STORE LOADS BUT NO PRODUCTS FOUND

**Trigger:** Page loads successfully but no product cards are detected after full scroll

**Phase:** Recon (Phase 1)

**Handler:**
```javascript
// Try multiple selectors before giving up
const selectors = [
  '[data-testid="product-card"]',
  '.product-card',
  'article',
  'a[href*="/product/"]'
];

let productElements = [];
for (const selector of selectors) {
  productElements = await page.$$(selector);
  if (productElements.length > 0) break;
}

if (productElements.length === 0) {
  await job.failJob(jobId, 'No products found on store page');
  console.error('❌ No products found. The store may be empty or dm2buy may have changed their page structure.');
  console.error('   If you believe this is wrong, check the store URL manually in a browser.');
  process.exit(1);
}
```

---

### E04 — ACTIVE JOB ALREADY EXISTS

**Trigger:** User tries to start a new import while one is already running for their account

**Phase:** Entry (index.js)

**Handler:**
```javascript
const activeJob = await job.getActiveJob(accountId);
if (activeJob) {
  console.error('❌ You already have an import in progress.');
  console.error(`   Status: ${activeJob.status}`);
  console.error(`   Store: ${activeJob.store_url}`);
  console.error('   Check back when it completes before starting a new import.');
  process.exit(1);
}
```

---

### E05 — VERIFICATION TIMEOUT — METHOD A

**Trigger:** Instagram story code not found after 10 minutes of polling

**Phase:** Verification (Phase 2)

**Handler:**
```javascript
console.warn('⚠️  Instagram story verification timed out after 10 minutes.');
console.warn('   Switching to fallback verification method...');
console.warn('');
console.warn('   FALLBACK: Add a ₹1 product to your dm2buy store named:');
console.warn(`   ${code}`);
console.warn('   Then type "done" and press Enter.');

// Trigger Method B
return await verifyByProductInjection(accountId, storeUrl, code, jobId);
```

---

### E06 — VERIFICATION TIMEOUT — METHOD B

**Trigger:** dm2buy product code not found after 10 minutes of polling

**Phase:** Verification (Phase 2)

**Handler:**
```javascript
await job.failJob(jobId, 'Verification failed — code not found via either method');
console.error('❌ Ownership verification failed.');
console.error('   The verification code was not found on your store or Instagram page.');
console.error('   Please ensure you:');
console.error('   1. Used the exact code provided (copy-paste, do not retype)');
console.error('   2. Saved/published the product or story before clicking verify');
console.error('   3. Did not let the 10-minute window expire');
console.error('');
console.error('   Start a new import to try again with a fresh code.');
process.exit(1);
```

---

### E07 — SINGLE PRODUCT EXTRACTION FAILS

**Trigger:** Playwright fails to extract data from an individual product page

**Phase:** Extraction (Phase 3)

**Handler:**
```javascript
// Do NOT fail the entire job for one product
// Log the failure, skip the product, continue

try {
  const product = await extractProduct(page, productUrl, id);
  products.push(product);
} catch (error) {
  console.warn(`⚠️  Failed to extract product at ${productUrl}`);
  console.warn(`   Error: ${error.message}`);
  console.warn('   Skipping this product and continuing...');
  
  // Add to migration flags
  migrationFlags.push({
    type: 'extraction_failed',
    severity: 'warning',
    product_id: null,
    message: `Product at ${productUrl} could not be extracted`,
    action_required: 'Add this product manually to your new store'
  });
}
```

---

### E08 — ALL PRODUCTS FAIL TO EXTRACT

**Trigger:** Zero products successfully extracted

**Phase:** Extraction (Phase 3)

**Handler:**
```javascript
if (products.length === 0) {
  await job.failJob(jobId, 'All product extractions failed');
  console.error('❌ No products could be extracted.');
  console.error('   dm2buy may have changed their page structure.');
  console.error('   Please report this issue with the store URL.');
  process.exit(1);
}
```

---

### E09 — IMAGE DOWNLOAD FAILS

**Trigger:** Single image URL returns 404, timeout, or connection error

**Phase:** Download (Phase 4)

**Handler:**
```javascript
// Retry once before marking as failed
async function downloadImage(url, savePath) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000
      });
      
      const writer = fs.createWriteStream(savePath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      // Verify file has content
      const stats = fs.statSync(savePath);
      if (stats.size === 0) throw new Error('Downloaded file is empty');
      
      return { success: true, path: savePath };
    } catch (error) {
      if (attempt === 2) {
        console.warn(`⚠️  Image download failed after 2 attempts: ${url}`);
        return { success: false, url, error: error.message };
      }
      await sleep(2000); // Wait 2s before retry
    }
  }
}
```

---

### E10 — ALL IMAGES FAIL TO DOWNLOAD

**Trigger:** Zero images successfully downloaded

**Phase:** Download (Phase 4)

**Handler:**
```javascript
// Do NOT fail the job — images may have expired on Azure CDN
// Complete the job but flag clearly

if (downloadedCount === 0) {
  console.warn('⚠️  No images could be downloaded.');
  console.warn('   The dm2buy Azure CDN may have expired for this store.');
  console.warn('   Your product data will still be imported.');
  console.warn('   You will need to upload product images manually.');
  
  // Add to migration flags
  migrationFlags.push({
    type: 'all_images_failed',
    severity: 'warning',
    product_id: null,
    message: 'No product images could be downloaded — CDN may have expired',
    action_required: 'Upload product images manually for all products'
  });
}
```

---

### E11 — SCHEMA VALIDATION FAILS

**Trigger:** Zod validation finds missing or incorrectly typed fields in formatted output

**Phase:** Validation (Phase 4)

**Handler:**
```javascript
try {
  StoreSchema.parse(formattedData);
  console.log('✅ Schema validation passed');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Schema validation failed. The following fields have issues:');
    error.errors.forEach(err => {
      console.error(`   Path: ${err.path.join('.')} — ${err.message}`);
    });
    console.error('');
    console.error('   Output files NOT written. Fix extraction logic before retrying.');
    await job.failJob(jobId, `Schema validation failed: ${error.errors.length} errors`);
    process.exit(1);
  }
  throw error; // Re-throw unknown errors
}
```

---

### E12 — SUPABASE CONNECTION FAILS

**Trigger:** Any Supabase operation returns an error (network, auth, or query error)

**Handler:**
```javascript
// In src/job.js — wrap every Supabase call

async function createJob(accountId, storeUrl) {
  const { data, error } = await supabase
    .from('import_jobs')
    .insert({ account_id: accountId, store_url: storeUrl })
    .select()
    .single();
  
  if (error) {
    // Supabase failure should not kill the scraper
    // Log it but continue — local output files are the primary deliverable
    console.warn(`⚠️  Supabase job tracking unavailable: ${error.message}`);
    console.warn('   Import will continue without job tracking.');
    return null; // Return null jobId — all job.update calls must check for null jobId
  }
  
  return data.id;
}

// Every job update function must guard against null jobId:
async function updateStatus(jobId, status) {
  if (!jobId) return; // Silently skip if no job tracking
  // ... rest of update
}
```

---

### E13 — PLAYWRIGHT BROWSER CRASHES

**Trigger:** Browser process crashes mid-extraction

**Phase:** Any

**Handler:**
```javascript
// In src/index.js — wrap entire execution in try/finally

let browser = null;
try {
  browser = await launchBrowser();
  // ... all phases
} catch (error) {
  console.error('❌ Unexpected error during import:');
  console.error(`   ${error.message}`);
  if (jobId) await job.failJob(jobId, error.message);
} finally {
  // ALWAYS close browser — even if everything crashes
  if (browser) {
    try {
      await closeBrowser(browser);
    } catch (closeError) {
      // Browser already dead — ignore
    }
  }
}
```

---

### E14 — OUTPUT DIRECTORY NOT WRITABLE

**Trigger:** fs operations fail when writing to `/output/`

**Handler:**
```javascript
// Check at startup before any processing begins

function ensureOutputDirectories() {
  const dirs = [
    process.env.OUTPUT_DIR,
    process.env.IMAGE_DIR
  ];
  
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(`❌ Cannot create output directory: ${dir}`);
      console.error(`   Error: ${error.message}`);
      console.error('   Check file system permissions and try again.');
      process.exit(1);
    }
  }
}
```

---

## ERROR LOGGING FORMAT

All errors and warnings must follow this format for consistency:

```
❌ [FATAL]   — Job stops. Process exits. User must restart.
⚠️  [WARNING] — Job continues. Issue logged. User notified in report.
ℹ️  [INFO]    — Informational. No action needed.
✅ [SUCCESS]  — Phase or task completed successfully.
```

---

## WHAT TO NEVER DO

- **Never** use `process.exit()` inside a module — only in `src/index.js`
- **Never** catch an error and continue without logging it
- **Never** write output files if schema validation failed
- **Never** leave the Playwright browser open — always close in finally
- **Never** swallow a Supabase error — always log it even if you recover
- **Never** produce a `store_data.json` with missing required fields

---

*Cross-reference: CLAUDE.md for where each module lives. ARCHITECTURE.md for phase context. TASKS.md for when error handlers are built. SCHEMA.md for required fields that trigger E11.*
