// One-time helper: mint a long-lived Google OAuth2 refresh token so the Netlify
// functions can upload ID photos to Drive AS THE CLUB'S OWN Google account
// (a service account has no storage quota — cf. netlify/functions/lib/google.js).
//
// Prerequisites (see README, section "Photos d'identité — OAuth Drive") :
//   • an OAuth client of type "Desktop app" created in the same GCP project ;
//   • its consent screen published "In production" (so the refresh token does not
//     expire after 7 days), scope drive.file (non-sensitive → no verification).
//
// Usage:
//   GOOGLE_OAUTH_CLIENT_ID=… GOOGLE_OAUTH_CLIENT_SECRET=… node scripts/get-drive-refresh-token.mjs
//   (or `npm run drive:token` after exporting the two variables / putting them in .env)
//
// It opens a consent page in the browser, captures the code on a local loopback
// server, exchanges it, and prints GOOGLE_OAUTH_REFRESH_TOKEN to paste into your
// env (locally in .env, in production via `netlify env:set`).

import http from 'node:http';
import { exec } from 'node:child_process';
import { google } from 'googleapis';

// A plain `node` run does NOT auto-load .env (only `netlify dev` does), so load
// it here. Values already present in the environment take precedence.
try {
  process.loadEnvFile('.env'); // Node ≥ 20.12 ; throws if the file is missing
} catch {
  /* no .env, or older Node → rely on the current environment */
}

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = Number(process.env.OAUTH_PORT || 53682);
const REDIRECT_URI = `http://localhost:${PORT}`;
// drive.file = per-file access to files the app creates. Enough to create the
// photo and overwrite it later, and NON-sensitive (no Google verification).
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.\n' +
      'Export them (or add them to .env) then re-run. They come from the "Desktop app"\n' +
      'OAuth client created in the GCP console.',
  );
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline', // ask for a refresh token
  prompt: 'consent', // force a refresh token even on re-consent
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('No code in the request.');
      return;
    }
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK — refresh token minted. You can close this tab and return to the terminal.');
    server.close();

    if (!tokens.refresh_token) {
      console.error(
        '\n⚠️  No refresh_token returned. This happens when you have already granted\n' +
          'consent before: revoke the app at https://myaccount.google.com/permissions\n' +
          'then run this script again (it forces prompt=consent).',
      );
      process.exit(1);
    }
    console.log('\n✅ Add this to your env (locally in .env, and on Netlify):\n');
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log('Netlify:');
    console.log(`  netlify env:set GOOGLE_OAUTH_REFRESH_TOKEN "${tokens.refresh_token}"`);
    console.log('  netlify env:set GOOGLE_OAUTH_CLIENT_ID "…"');
    console.log('  netlify env:set GOOGLE_OAUTH_CLIENT_SECRET "…"\n');
    process.exit(0);
  } catch (err) {
    console.error('Token exchange failed:', err.message);
    res.writeHead(500).end('Token exchange failed — see the terminal.');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nOpen this URL to authorize (as the CLUB'S Google account):\n\n${authUrl}\n`);
  // Best-effort auto-open (macOS/Linux/WSL); ignore failures.
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${opener} "${authUrl}"`, () => {});
  console.log(`Waiting for the redirect on ${REDIRECT_URI} …`);
});
