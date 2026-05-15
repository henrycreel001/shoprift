/**
 * src/downloader.js — Image downloading via Axios streams.
 * Downloads all product images to /output/images/{product-slug}/{index}.jpg
 * Retries once on failure. Verifies file size > 0.
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { withRetry, computeSlug } from './utils.js';
import { httpsAgent } from './api.js';
import * as job from './job.js';
import 'dotenv/config';


/**
 * Downloads a single image from a CDN URL to a local file path.
 * Retries once on failure. Verifies downloaded file is non-empty.
 * @param {string} url — CDN image URL
 * @param {string} savePath — absolute or relative local path
 * @returns {Promise<{ success: boolean, path?: string, url?: string, error?: string }>}
 */
export async function downloadImage(url, savePath) {
  try {
    await withRetry(async () => {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 30_000,
        httpsAgent
      });

      const ct = response.headers['content-type'] || '';
      if (ct.includes('text/html')) {
        // Permanent failure — CDN returned error page, not an image. Don't retry.
        const err = new Error(`CDN returned HTML page instead of image (likely 404): ${url}`);
        err.permanent = true;
        throw err;
      }

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(savePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const stats = fs.statSync(savePath);
      if (stats.size === 0) throw new Error('Downloaded file is empty (0 bytes)');
    }, { attempts: 3, baseDelayMs: 2000, timeoutMs: 30_000 });

    return { success: true, path: savePath };
  } catch (err) {
    // Clean up any partial file left on disk so the zip doesn't include empty images
    try { if (fs.existsSync(savePath)) fs.unlinkSync(savePath); } catch {}
    console.warn(`⚠️  Image download failed: ${url}`);
    console.warn(`   Error: ${err.message}`);
    return { success: false, url, error: err.message };
  }
}

/**
 * Downloads all images for all products.
 * Creates /output/images/{product-slug}/ directory per product (human-readable).
 * Falls back to product ID if slug is empty or collides.
 * Updates Supabase job progress after each image.
 * @param {object[]} products — array of products per SCHEMA.md (with images_cdn)
 * @param {string | null} jobId
 * @returns {Promise<{ succeeded: Array<{productId,index,path}>, failed: Array<{productId,url,error}> }>}
 */
export async function downloadAllImages(products, jobId, imageDir = process.env.IMAGE_DIR || './output/images') {
  fs.mkdirSync(imageDir, { recursive: true });

  // Build unique slug per product for human-readable image folders
  const usedSlugs = new Set();
  const productSlugs = products.map(p => {
    let slug = computeSlug(p.name) || String(p.id);
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    usedSlugs.add(slug);
    return slug;
  });

  const succeeded = [];
  const failed = [];
  let totalImages = 0;
  let downloadedCount = 0;

  // Count total images upfront for progress tracking
  for (const p of products) totalImages += p.images_cdn.length;

  for (let pi = 0; pi < products.length; pi++) {
    const product = products[pi];
    const productDir = path.join(imageDir, productSlugs[pi]);
    fs.mkdirSync(productDir, { recursive: true });

    for (let i = 0; i < product.images_cdn.length; i++) {
      const url = product.images_cdn[i];
      const savePath = path.join(productDir, `${i}.jpg`);
      downloadedCount++;

      console.log(`⏳ Downloading images... (${downloadedCount}/${totalImages})`);

      if (jobId) {
        await job.updateProgress(
          jobId, downloadedCount, totalImages,
          'downloading',
          `Downloading images (${downloadedCount}/${totalImages})`
        ).catch(() => {});
      }

      const result = await downloadImage(url, savePath);

      if (result.success) {
        succeeded.push({ productId: product.id, index: i, path: result.path });
      } else {
        failed.push({ productId: product.id, url, error: result.error });
      }
    }
  }

  return { succeeded, failed };
}
