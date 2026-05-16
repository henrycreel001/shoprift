/**
 * worker.js — Railway entry point for the BullMQ extraction worker.
 * Start with: node worker.js
 * Railway: set Start Command to "node worker.js"
 */

import 'dotenv/config';
import { extractionWorker } from './src/queue.js';

console.log('🚂 Shoprift extraction worker started');
console.log(`   Queue: shoprift-jobs`);
console.log(`   Concurrency: 1`);
console.log(`   Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);

process.on('SIGTERM', async () => {
  console.log('SIGTERM received — closing worker gracefully');
  await extractionWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await extractionWorker.close();
  process.exit(0);
});
