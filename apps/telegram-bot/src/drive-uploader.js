/**
 * drive-uploader.js
 * Uploads a file to Google Drive and returns a public shareable link.
 * Auth: OAuth2 refresh token (uploads as your Google account, uses your quota).
 * Required env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
 *               GOOGLE_OAUTH_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID
 * Run scripts/authorize_drive.js once to get the refresh token.
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

/**
 * @param {string} filePath   Absolute path to file to upload
 * @param {string} fileName   Display name in Drive
 * @param {string} [mimeType] MIME type (default: application/octet-stream)
 * @returns {Promise<{ url: string, fileId: string }>}
 */
export async function uploadToDrive(filePath, fileName, mimeType = 'application/octet-stream') {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const folderId     = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientId)     throw new Error('GOOGLE_OAUTH_CLIENT_ID not set');
  if (!clientSecret) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET not set');
  if (!refreshToken) throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN not set — run scripts/authorize_drive.js once');
  if (!folderId)     throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: 'v3', auth: oauth2 });

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
    fields: 'id',
  });

  const fileId = res.data.id;

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    fileId,
    url: `https://drive.google.com/file/d/${fileId}/view`,
  };
}

/**
 * Uploads a local directory tree to a new Google Drive folder.
 * ZIP files are skipped — contents are uploaded as individual files.
 * @param {string} localDir   Absolute path to local directory
 * @param {string} folderName Name for the new Drive folder
 * @returns {Promise<{ folderId: string, url: string }>}
 */
export async function uploadFolderToDrive(localDir, folderName) {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const parentId     = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientId)     throw new Error('GOOGLE_OAUTH_CLIENT_ID not set');
  if (!clientSecret) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET not set');
  if (!refreshToken) throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN not set — run scripts/authorize_drive.js once');
  if (!parentId)     throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth: oauth2 });

  const folderRes = await drive.files.create({
    requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  const folderId = folderRes.data.id;

  await drive.permissions.create({
    fileId: folderId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  await _uploadDirContents(drive, localDir, folderId);

  return { folderId, url: `https://drive.google.com/drive/folders/${folderId}` };
}

const UPLOAD_CONCURRENCY = 8;

/**
 * Runs async fns with max `limit` in-flight at once.
 * @param {number} limit
 * @param {Array<() => Promise<any>>} fns
 */
async function _pool(limit, fns) {
  const executing = new Set();
  for (const fn of fns) {
    const p = fn().finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
}

/** @param {object} drive @param {string} localDir @param {string} parentId */
async function _uploadDirContents(drive, localDir, parentId) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  const files   = entries.filter(e => !e.isDirectory() && !e.name.endsWith('.zip'));
  const dirs    = entries.filter(e => e.isDirectory());

  // Upload all files in this directory in parallel (concurrency-limited)
  await _pool(UPLOAD_CONCURRENCY, files.map(entry => () =>
    drive.files.create({
      requestBody: { name: entry.name, parents: [parentId] },
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(path.join(localDir, entry.name)) },
      fields: 'id',
    })
  ));

  // Create subdirs and recurse — subdirs run in parallel, each waits for its own contents
  await Promise.all(dirs.map(async dir => {
    const subRes = await drive.files.create({
      requestBody: { name: dir.name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    await _uploadDirContents(drive, path.join(localDir, dir.name), subRes.data.id);
  }));
}
