/**
 * worker.js — Railway entry point for the BullMQ extraction worker.
 * Start with: node worker.js
 * Railway: set Start Command to "node worker.js"
 */

import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { extractionWorker } from './src/queue.js';
import { startServer } from './src/server.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

console.log('🚂 Shoprift extraction worker started');
console.log(`   Queue: shoprift-jobs`);
console.log(`   Concurrency: 1`);
console.log(`   Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);

const server = startServer();

process.on('SIGTERM', async () => {
  console.log('SIGTERM received — closing worker gracefully');
  server.close();
  await extractionWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  server.close();
  await extractionWorker.close();
  process.exit(0);
});
