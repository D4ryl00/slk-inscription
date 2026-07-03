// Écriture dans le Google Sheet via l'API Sheets UNIQUEMENT (pas de Drive).
// Le compte de service doit avoir le Sheet partagé en « Éditeur ».

import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_SHEET_TAB || 'Feuille 1';

/** Charge les identifiants du compte de service depuis l'env (JSON ou base64:JSON). */
function loadServiceAccount() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON manquant.');
  if (raw.startsWith('base64:')) {
    raw = Buffer.from(raw.slice('base64:'.length), 'base64').toString('utf8');
  }
  return JSON.parse(raw);
}

let _sheets;
async function getSheets() {
  if (_sheets) return _sheets;
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID manquant.');
  const creds = loadServiceAccount();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/**
 * Ajoute une ligne sur la PREMIÈRE ligne vide du tableau.
 * `append` détecte la fin des données et insère juste après — les lignes
 * ajoutées à la main par le bureau cohabitent sans être écrasées.
 * @param {(string|number)[]} values dans l'ordre exact des colonnes
 */
export async function appendRow(values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${quoteTab(TAB)}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

/**
 * Récupère les valeurs d'une colonne (par index 0-based) pour la déduplication.
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

/** Vrai si `token` apparaît déjà dans la colonne (paiement déjà enregistré). */
export async function columnContains(colIndex, token) {
  if (!token) return false;
  const values = await getColumnValues(colIndex);
  return values.some((v) => String(v).includes(token));
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
  // Échappe le nom d'onglet pour la notation A1 (espaces, apostrophes).
  return `'${tab.replace(/'/g, "''")}'`;
}
