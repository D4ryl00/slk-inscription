// Writes to the Google Sheet through the Sheets API ONLY (no Drive).
// The service account must have the Sheet shared as an "Editor".

import { google } from 'googleapis';
import { FORM_COLUMNS } from '../../../src/shared/config.js';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_SHEET_TAB || 'Feuille 1';

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
