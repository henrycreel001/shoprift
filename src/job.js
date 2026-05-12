/**
 * src/job.js — Supabase job status tracking.
 * All import jobs are tracked here from recon to complete/failed.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

/**
 * Creates a new import job record in Supabase.
 * Enforces one active job per account — throws if one already exists.
 * @param {string} accountId
 * @param {string} storeUrl
 * @returns {Promise<string>} jobId
 */
export async function createJob(accountId, storeUrl) {
  const { data, error } = await supabase
    .from('import_jobs')
    .insert({ account_id: accountId, store_url: storeUrl, status: 'recon' })
    .select('id')
    .single();

  if (error) throw new Error(`[job.createJob] Failed to create job: ${error.message}`);
  return data.id;
}

/**
 * Updates the status field of a job.
 * @param {string} jobId
 * @param {string} status — 'recon' | 'verifying' | 'extracting' | 'downloading' | 'complete' | 'failed'
 * @returns {Promise<void>}
 */
export async function updateStatus(jobId, status) {
  const { error } = await supabase
    .from('import_jobs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) throw new Error(`[job.updateStatus] ${error.message}`);
}

/**
 * Updates job progress for real-time monitoring.
 * @param {string} jobId
 * @param {number} current
 * @param {number} total
 * @param {string} phase — internal phase key
 * @param {string} phaseLabel — human readable e.g. 'Downloading images (12/18)'
 * @returns {Promise<void>}
 */
export async function updateProgress(jobId, current, total, phase, phaseLabel) {
  const { error } = await supabase
    .from('import_jobs')
    .update({
      progress: { current, total, phase, phase_label: phaseLabel },
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);

  if (error) throw new Error(`[job.updateProgress] ${error.message}`);
}

/**
 * Stores recon results on the job record.
 * @param {string} jobId
 * @param {object} reconData — recon_data object per SCHEMA.md
 * @returns {Promise<void>}
 */
export async function updateReconData(jobId, reconData) {
  const { error } = await supabase
    .from('import_jobs')
    .update({ recon_data: reconData, updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) throw new Error(`[job.updateReconData] ${error.message}`);
}

/**
 * Marks a job as failed and stores the error message.
 * @param {string} jobId
 * @param {string} errorMessage
 * @returns {Promise<void>}
 */
export async function failJob(jobId, errorMessage) {
  const { error } = await supabase
    .from('import_jobs')
    .update({ status: 'failed', error: errorMessage, updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) throw new Error(`[job.failJob] ${error.message}`);
}

/**
 * Marks a job as complete.
 * @param {string} jobId
 * @returns {Promise<void>}
 */
export async function completeJob(jobId) {
  const { error } = await supabase
    .from('import_jobs')
    .update({ status: 'complete', updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) throw new Error(`[job.completeJob] ${error.message}`);
}

/**
 * Returns the active (non-complete, non-failed) job for an account, if one exists.
 * Used to enforce one-job-per-account rule.
 * @param {string} accountId
 * @returns {Promise<object | null>} job record or null
 */
export async function getActiveJob(accountId) {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('id, status, store_url, created_at')
    .eq('account_id', accountId)
    .not('status', 'in', '("complete","failed")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`[job.getActiveJob] ${error.message}`);
  return data;
}
