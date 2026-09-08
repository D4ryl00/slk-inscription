// Reading a birthdate off the clipboard. Front-only (the functions never see
// anything but the ISO value the field ends up holding), pure and no DOM, so it
// can be unit-tested.
//
// The native <input type="date"> takes a full date typed digit by digit but
// ignores a paste, which is how people carry a birthdate around: copied from a
// message, a spreadsheet, another form. Members are French and type in the
// French order exclusively, so that is how a pasted date is read — with the ISO
// order recognised too, since spreadsheets and other web forms hand out
// "2000-01-31".
//
// Anything ambiguous is REFUSED rather than guessed. A misread birthdate is
// nearly invisible here: the tariff only looks at the birth YEAR
// (ageInSeason), so swapping day and month leaves the price untouched and the
// member reviewing their total has no way to notice. The full date, though,
// decides whether the parental authorisation is required (isMinorFromBirthdate)
// and is what lands in the register and on the FFK licence.

const MIN_YEAR = 1900;

/** True when {y, m, d} is a real calendar date (rejects 31/02, 00/01, …). */
function isRealDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Turns pasted text into the 'YYYY-MM-DD' the date field expects.
 *
 * Accepted — any run of non-digits separates the groups, so '/', '-', '.', a
 * space or a mix all work:
 *   '31/01/2000', '31-01-2000', '31.01.2000', '31 01 2000' → day first
 *   '2000-01-31'                                          → 4-digit group first, ISO
 *   '31012000'                                             → 8 digits, ddmmyyyy
 *   '20000131'                                             → 8 digits opening on a
 *                                                            plausible year, yyyymmdd
 * Refused (returns null, the paste is left to the browser):
 *   '31/01/00'    → 1900 or 2000? Both plausible for a club that registers
 *                   children and veterans alike.
 *   '31/02/2000'  → not a real date
 *   '1er janvier 2000', '2000-01' → not a full numeric date
 *
 * @param {string} text clipboard content
 * @param {Date} [refDate=new Date()] reference date; a birthdate is never later
 * @returns {string|null} 'YYYY-MM-DD', or null when the text is not an
 *   unambiguous full date
 */
export function parsePastedBirthdate(text, refDate = new Date()) {
  const groups = String(text ?? '').trim().split(/\D+/).filter(Boolean);

  let year;
  let month;
  let day;

  if (groups.length === 3) {
    const [a, b, c] = groups;
    if (a.length === 4) [year, month, day] = [a, b, c];
    else if (c.length === 4) [day, month, year] = [a, b, c];
    else return null; // two-digit year → which century?
  } else if (groups.length === 1 && groups[0].length === 8) {
    const digits = groups[0];
    const head = Number(digits.slice(0, 4));
    // '20000131' opens on a year that could be a birth year; '31012000' cannot
    // (3101 is no year), which is what tells the two layouts apart.
    if (head >= MIN_YEAR && head <= refDate.getFullYear()) {
      [year, month, day] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)];
    } else {
      [day, month, year] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
    }
  } else {
    return null;
  }

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < MIN_YEAR || y > refDate.getFullYear()) return null;
  if (!isRealDate(y, m, d)) return null;

  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}
