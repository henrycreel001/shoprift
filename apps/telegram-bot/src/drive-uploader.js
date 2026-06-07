/**
 * drive-uploader.js
 * Uploads a file to Google Drive and returns a public shareable link.
 * Auth: service account via GOOGLE_SERVICE_ACCOUNT_JSON env var (full JSON string).
 * Uploads into folder GOOGLE_DRIVE_FOLDER_ID.
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

/**
 * @param {string} filePath  Absolute path to file to upload
 * @param {string} fileName  Display name in Drive
 * @param {string} [mimeType] MIME type (default: application/octet-stream)
 * @returns {Promise<{ url: string, fileId: string }>}
 */
export async function uploadToDrive(filePath, fileName, mimeType = 'application/octet-stream') {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!raw)      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

  let credentials;
  try {
    credentials = JSON.parse(raw.trim());
  } catch {
    // fallback: treat value as a file path
    credentials = JSON.parse(fs.readFileSync(raw.trim(), 'utf8'));
  }
  // dotenv converts literal \n sequences in private_key — restore them
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });

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
