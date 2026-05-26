/**
 * src/dev-server.js — Local dev entry point: Express HTTP server only.
 * No BullMQ, no Redis required. Use for T5 local testing.
 * Start: node src/dev-server.js
 * On Railway: use worker.js (includes BullMQ extraction worker).
 */

import 'dotenv/config';
import { startServer } from './server.js';

console.log('🛠️  Shoprift dev server (HTTP only — no BullMQ worker)');

const server = startServer();

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
