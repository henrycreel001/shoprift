/**
 * authorize_drive.js — run ONCE to get your OAuth2 refresh token.
 * Usage: node scripts/authorize_drive.js
 * Needs: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env
 * Prints GOOGLE_OAUTH_REFRESH_TOKEN — add it to .env, never run again.
 */

import 'dotenv/config';
import { google } from 'googleapis';
import readline from 'readline';

const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first.');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(
  clientId,
  clientSecret,
  'urn:ietf:wg:oauth:2.0:oob'  // desktop/OOB redirect
);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive.file'],
  prompt: 'consent',            // forces refresh_token to be returned
});

console.log('\n1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Authorize the app, copy the code shown.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('3. Paste the code here: ', async code => {
  rl.close();
  try {
    const { tokens } = await oauth2.getToken(code.trim());
    console.log('\n✅ Add this to your .env:\n');
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nDone. You never need to run this script again.\n');
  } catch (e) {
    console.error('Failed to exchange code:', e.message);
    process.exit(1);
  }
});
