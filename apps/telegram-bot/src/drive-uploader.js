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
