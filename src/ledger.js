/**
 * src/ledger.js — Append-only job ledger at output/_ledger.csv.
 * appendJob() adds one row per completed job.
 * getJobs() reads all rows (used by future admin panel).
 * Falls back to _ledger_pending.csv if main ledger is locked (e.g. open in Excel).
 */

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import 'dotenv/config';

const OUTPUT_ROOT = process.env.OUTPUT_DIR || './output';
const LEDGER_PATH = path.join(OUTPUT_ROOT, '_ledger.csv');
const PENDING_PATH = path.join(OUTPUT_ROOT, '_ledger_pending.csv');

const LEDGER_FIELDS = [
  'job_id', 'client_slug', 'client_display_name', 'store_url', 'store_name',
  'run_date', 'run_time_ist', 'duration_seconds', 'products', 'images',
  'csv_format', 'csv_template_path', 'unmapped_count', 'status',
  'price_quoted_inr', 'price_paid_inr', 'delivery_channel', 'client_contact', 'notes'
];

/**
 * Converts job_metadata.json object to an ordered value array matching LEDGER_FIELDS.
 * @param {object} m — job metadata
 * @returns {Array}
 */
function toRow(m) {
  const started = m.run_started_at || '';
  return [
    m.job_id || '',
    m.client_slug || '',
    m.client_display_name ?? '',
    m.store_url || '',
    m.store_name || '',
    started.slice(0, 10),   // run_date: "2026-05-12"
    started.slice(11, 16),  // run_time_ist: "18:15"
    m.duration_seconds ?? '',
    m.products_count ?? '',
    m.images_count ?? '',
    m.csv_format || '',
    m.csv_template_path ?? '',
    Array.isArray(m.unmapped_columns) ? m.unmapped_columns.length : 0,
    m.status || '',
    m.price_quoted_inr ?? '',
    m.price_paid_inr ?? '',
    m.delivery_channel ?? '',
    m.client_contact ?? '',
    m.notes ?? ''
  ];
}

/**
 * Appends a new row to _ledger.csv.
 * If the file is locked or unwritable, saves to _ledger_pending.csv instead.
 * @param {object} jobMetadata — contents of job_metadata.json
 */
export function appendJob(jobMetadata) {
  // unparse a single data row (no header — headers already in file)
  const csvLine = Papa.unparse([toRow(jobMetadata)], { header: false, newline: '\n' }) + '\n';

  try {
    fs.appendFileSync(LEDGER_PATH, csvLine, 'utf8');
    console.log(`✅ Ledger updated → ${LEDGER_PATH}`);
  } catch (err) {
    console.warn(`⚠️  Could not write to _ledger.csv: ${err.message}`);
    console.warn('   Saving to _ledger_pending.csv — merge manually before next session.');

    try {
      if (!fs.existsSync(PENDING_PATH)) {
        fs.writeFileSync(PENDING_PATH, LEDGER_FIELDS.join(',') + '\n' + csvLine, 'utf8');
      } else {
        fs.appendFileSync(PENDING_PATH, csvLine, 'utf8');
      }
    } catch (pendingErr) {
      console.error(`❌ Could not write to _ledger_pending.csv either: ${pendingErr.message}`);
      console.error('   Job metadata is saved in job_metadata.json — add ledger row manually.');
    }
  }
}

/**
 * Reads _ledger.csv and returns all rows as objects keyed by LEDGER_FIELDS.
 * Returns empty array if ledger missing or unreadable.
 * @returns {object[]}
 */
export function getJobs() {
  if (!fs.existsSync(LEDGER_PATH)) return [];

  try {
    const csv = fs.readFileSync(LEDGER_PATH, 'utf8');
    const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
    return result.data;
  } catch (err) {
    console.warn(`⚠️  Could not read ledger: ${err.message}`);
    return [];
  }
}
