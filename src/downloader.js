/**
 * src/downloader.js — Image downloading via Axios streams.
 * Downloads all product images to /output/images/{productId}/{index}.jpg
 * Retries once on failure. Verifies file size > 0.
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { sleep } from './utils.js';
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
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 30_000
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(savePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const stats = fs.statSync(savePath);
      if (stats.size === 0) throw new Error('Downloaded file is empty (0 bytes)');

      return { success: true, path: savePath };
    } catch (err) {
      if (attempt === 2) {
        console.warn(`⚠️  Image download failed after 2 attempts: ${url}`);
        console.warn(`   Error: ${err.message}`);
        return { success: false, url, error: err.message };
      }
      await sleep(2000);
    }
  }
}

/**
 * Downloads all images for all products.
 * Creates /output/images/{productId}/ directory per product.
 * Updates Supabase job progress after each image.
 * @param {object[]} products — array of products per SCHEMA.md (with images_cdn)
 * @param {string | null} jobId
 * @returns {Promise<{ succeeded: Array<{productId,index,path}>, failed: Array<{productId,url,error}> }>}
 */
export async function downloadAllImages(products, jobId, imageDir = process.env.IMAGE_DIR || './output/images') {
  fs.mkdirSync(imageDir, { recursive: true });

  const succeeded = [];
  const failed = [];
  let totalImages = 0;
  let downloadedCount = 0;

  // Count total images upfront for progress tracking
  for (const p of products) totalImages += p.images_cdn.length;

  for (const product of products) {
    const productDir = path.join(imageDir, String(product.id));
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
