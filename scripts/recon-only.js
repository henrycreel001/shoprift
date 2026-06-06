/**
 * scripts/recon-only.js — Run recon for a store URL, print summary, no extraction.
 * Usage: node scripts/recon-only.js <store-url>
 * Clears any active job for the account before starting.
 */

import 'dotenv/config';
import * as job from '../src/job.js';
import { recon } from '../src/recon.js';
import { launchBrowser, getPage, closeBrowser } from '../src/browser.js';
import { isDm2buyUrl, deriveClientSlug } from '../src/utils.js';

const storeUrl = process.argv[2];

if (!storeUrl || !isDm2buyUrl(storeUrl)) {
  console.error('Usage: node scripts/recon-only.js https://yourstore.dm2buy.com');
  process.exit(1);
}

const accountId = deriveClientSlug(storeUrl);
let browser = null;

async function main() {
  // Clear any active job for this account
  const activeJob = await job.getActiveJob(accountId).catch(() => null);
  if (activeJob) {
    console.log(`⚠️  Clearing active job ${activeJob.id} (status: ${activeJob.status})`);
    await job.failJob(activeJob.id, 'Cleared by recon-only script').catch(() => {});
    console.log('   Job cleared.\n');
  }

  browser = await launchBrowser();
  const page = await getPage(browser);

  let jobId = null;
  try {
    jobId = await job.createJob(accountId, storeUrl).catch(() => null);
    console.log(`🔍 Running recon for: ${storeUrl}\n`);

    const reconData = await recon(storeUrl, page);

    if (jobId) await job.updateReconData(jobId, reconData).catch(() => {});
    if (jobId) await job.failJob(jobId, 'Recon-only run — no extraction').catch(() => {});

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅  RECON SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Store Name:    ${reconData.store_name}`);
    console.log(`Store URL:     ${reconData.store_url}`);
    console.log(`Store ID:      ${reconData.store_id}`);
    console.log(`Instagram:     @${reconData.instagram_handle || 'not found'}`);
    console.log(`Products:      ${reconData.product_count}`);
    console.log(`Collections:   ${reconData.collection_count}`);
    console.log(`Images:        ${reconData.image_count}`);
    console.log(`Est. import:   ${reconData.estimated_import_label}`);
    console.log(`Timestamp:     ${reconData.recon_timestamp}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error(`❌ Recon failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }
}

main()
  .then(() => { if (browser) closeBrowser(browser); })
  .catch(err => {
    if (browser) closeBrowser(browser).catch(() => {});
    console.error(`❌ Unexpected: ${err.message}`);
    process.exit(1);
  });
