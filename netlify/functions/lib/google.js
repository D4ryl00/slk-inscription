// Writes to the Google Sheet (Sheets API) and, optionally, uploads the member's
// ID photo to a Google Drive folder (Drive API). Both use the SAME service
// account: share the Sheet AND the Drive folder with it as an "Editor".
// The photo upload is skipped entirely when GOOGLE_DRIVE_PHOTOS_FOLDER_ID is unset.

import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { FORM_COLUMNS } from '../../../src/shared/config.js';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_SHEET_TAB || 'Feuille 1';
const PHOTOS_FOLDER_ID = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;

/** Loads the service account credentials from env (JSON or base64:JSON). */
function loadServiceAccount() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON.');
  if (raw.startsWith('base64:')) {
    raw = Buffer.from(raw.slice('base64:'.length), 'base64').toString('utf8');
  }
  return JSON.parse(raw);
}

let _sheets;
async function getSheets() {
  if (_sheets) return _sheets;
  if (!SHEET_ID) throw new Error('Missing GOOGLE_SHEET_ID.');
  const creds = loadServiceAccount();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

let _drive;
async function getDrive() {
  if (_drive) return _drive;
  const creds = loadServiceAccount();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

let _headersEnsured = false;

/**
 * Writes the header row (FORM_COLUMNS) at A1 IF the sheet is empty.
 * Idempotent: touches nothing if the first row already holds something (headers
 * already written or data entered by hand). The result is memoized so we do not
 * re-read the Sheet on every `append` within the same cold start.
 */
export async function ensureHeaders() {
  if (_headersEnsured) return;
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${quoteTab(TAB)}!A1:1`,
  });
  const firstRow = res.data.values?.[0] || [];
  const isEmpty = firstRow.every((c) => String(c ?? '').trim() === '');
  if (isEmpty) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${quoteTab(TAB)}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [FORM_COLUMNS] },
    });
  }
  _headersEnsured = true;
}

/**
 * Appends a row at the FIRST empty row of the sheet.
 * `append` detects the end of the data and inserts right after — rows added by
 * hand by the office coexist without being overwritten.
 * We first ensure the headers exist (new Sheet → first row written).
 * @param {(string|number)[]} values in the exact column order
 */
export async function appendRow(values) {
  const sheets = await getSheets();
  await ensureHeaders();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${quoteTab(TAB)}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

/**
 * Fetches a column's values (by 0-based index) for deduplication.
 * @returns {Promise<string[]>}
 */
export async function getColumnValues(colIndex) {
  const sheets = await getSheets();
  const col = columnLetter(colIndex);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${quoteTab(TAB)}!${col}2:${col}`,
  });
  return (res.data.values || []).map((r) => r[0] ?? '');
}

/** Splits a `data:<mime>;base64,<payload>` URL into { mimeType, data:Buffer } (null if malformed). */
function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const mimeType = m[1] || 'application/octet-stream';
  const data = m[2]
    ? Buffer.from(m[3], 'base64')
    : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  return { mimeType, data };
}

/** File extension for the mime types the front can send (it re-encodes to JPEG). */
function extensionForMime(mimeType) {
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mimeType] || '.jpg';
}

/**
 * Uploads the member's ID photo to the Drive folder GOOGLE_DRIVE_PHOTOS_FOLDER_ID.
 * The file is named "Nom Prénom.<ext>"; if a file with that exact name already
 * exists in the folder, its content is OVERWRITTEN (same fileId kept).
 * No-ops (returns { skipped }) when no folder is configured or no photo is given —
 * the photo is optional and its upload must never block a paid registration.
 * `supportsAllDrives` lets it target a Shared Drive (recommended, cf. README).
 * @param {{ nom?: string, prenom?: string, dataUrl?: string }} arg
 */
export async function uploadMemberPhoto({ nom, prenom, dataUrl } = {}) {
  if (!PHOTOS_FOLDER_ID) return { skipped: 'no folder configured' };
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { skipped: 'no photo' };

  const drive = await getDrive();
  const name = `${(nom || '').trim()} ${(prenom || '').trim()}`.trim() + extensionForMime(parsed.mimeType);

  // Look for an existing file with the same name in the folder (→ overwrite).
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const list = await drive.files.list({
    q: `name = '${escaped}' and '${PHOTOS_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const media = { mimeType: parsed.mimeType, body: Readable.from(parsed.data) };
  const existing = list.data.files?.[0];
  if (existing) {
    const res = await drive.files.update({
      fileId: existing.id,
      media,
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });
    return { id: existing.id, name, url: res.data.webViewLink || '', updated: true };
  }
  const res = await drive.files.create({
    requestBody: { name, parents: [PHOTOS_FOLDER_ID] },
    media,
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id, name, url: res.data.webViewLink || '', created: true };
}

function columnLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function quoteTab(tab) {
  // Escapes the tab name for A1 notation (spaces, apostrophes).
  return `'${tab.replace(/'/g, "''")}'`;
}
