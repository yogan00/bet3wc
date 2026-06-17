const { google } = require("googleapis");
const {
  GOOGLE_SERVICE_ACCOUNT_JSON,
  DATABASE_SHEET_ID,
  OUTPUT_SHEET_ID,
  DB_USERS_SHEET,
  DB_MATCHES_SHEET,
  OUTPUT_SHEET,
} = require("./config");

// Light fill colors used to highlight picks in the "Chọn đội" sheet after
// scores are recalculated. Values are RGB floats in the 0–1 range, per the
// Sheets API's Color spec.
const COLOR_WIN = { red: 0.80, green: 0.94, blue: 0.80 };   // light green
const COLOR_LOSS = { red: 0.98, green: 0.80, blue: 0.80 };  // light red
const COLOR_BLANK = { red: 1.00, green: 0.95, blue: 0.70 }; // light yellow
// The Sheets API has no real "unset" for backgroundColor — sending {} is
// interpreted as RGB defaults (0,0,0 = black), not "no fill". To reset a
// cell we must explicitly send white.
const COLOR_NONE = { red: 1, green: 1, blue: 1 }; // reset to white

function getAuth() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON)
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const creds =
    typeof GOOGLE_SERVICE_ACCOUNT_JSON === "string"
      ? JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON)
      : GOOGLE_SERVICE_ACCOUNT_JSON;
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

async function getUsers() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: DATABASE_SHEET_ID,
    range: `${DB_USERS_SHEET}!A2:C`,
  });
  const rows = res.data.values || [];
  return rows
    .filter((r) => r[0] && r[2])
    .map((r) => ({
      number: Number(r[0]),
      name: String(r[1] || ""),
      id: String(r[2] || ""),
    }));
}

async function writeUserScores(scores) {
  if (scores.length === 0) return;
  const sheets = getSheetsClient();
  const data = [];
  for (const s of scores) {
    data.push({
      range: `${DB_USERS_SHEET}!D${s.rowIdx + 1}:E${s.rowIdx + 1}`,
      values: [[s.won, s.lost]],
    });
    const winrate = s.voteCount === 0
      ? "n/a"
      : s.voteCount < s.decidedCount
        ? "không đủ trận để tính"
        : `${(s.winCount / s.voteCount * 100).toFixed(2)}%`;
    data.push({
      range: `${DB_USERS_SHEET}!G${s.rowIdx + 1}`,
      values: [[winrate]],
    });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: DATABASE_SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// Reads the "Lịch" sheet into match objects. When two or more matches kick
// off at the exact same dateTime (common in group-stage rounds), the
// "dateTime" string alone can't tell them apart. So each match also gets an
// `occurrence` number: 0 for the first match with that dateTime (in column
// order), 1 for the second, and so on. Everything downstream that needs to
// uniquely identify a match (picks, scoring, coloring) uses the pair
// (dateTime, occurrence) instead of dateTime alone.
async function getMatches() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: DATABASE_SHEET_ID,
    range: `${DB_MATCHES_SHEET}!A1:ZZ6`,
  });
  const rows = res.data.values || [];
  if (rows.length < 3) return [];

  const dtRow       = rows[0] || [];
  const t1Row       = rows[1] || [];
  const t2Row       = rows[2] || [];
  const wRow        = rows[3] || [];
  const typeRow     = rows[4] || [];
  const handicapRow = rows[5] || [];

  const matches = [];
  const occurrenceSeen = new Map(); // dateTime -> count of matches seen so far
  for (let i = 1; i < dtRow.length; i++) {
    const dateTime = dtRow[i];
    const team1    = t1Row[i];
    const team2    = t2Row[i];
    if (dateTime && team1 && team2) {
      const dtStr = String(dateTime);
      const occurrence = occurrenceSeen.get(dtStr) || 0;
      occurrenceSeen.set(dtStr, occurrence + 1);
      matches.push({
        dateTime: dtStr,
        team1:    String(team1),
        team2:    String(team2),
        winner:   wRow[i]        ? String(wRow[i])        : undefined,
        type:     typeRow[i]     ? String(typeRow[i])     : undefined,
        handicap: handicapRow[i] ? String(handicapRow[i]).replace(',', '.') : undefined,
        occurrence,
      });
    }
  }
  return matches;
}

async function setMatches(matches) {
  const sheets = getSheetsClient();
  const dtRow       = ["Day & time", ...matches.map((m) => m.dateTime)];
  const t1Row       = ["Team 1",     ...matches.map((m) => m.team1)];
  const t2Row       = ["Team 2",     ...matches.map((m) => m.team2)];
  const wRow        = ["Winner",     ...matches.map((m) => m.winner || "")];
  const typeRow     = ["Type",       ...matches.map((m) => m.type || "")];
  const handicapRow = ["Handicap",   ...matches.map((m) => m.handicap || "")];

  await sheets.spreadsheets.values.clear({
    spreadsheetId: DATABASE_SHEET_ID,
    range: `${DB_MATCHES_SHEET}!A1:ZZ6`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: DATABASE_SHEET_ID,
    range: `${DB_MATCHES_SHEET}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [dtRow, t1Row, t2Row, wRow, typeRow, handicapRow] },
  });
}

// Builds a lookup of "dateTime|occurrence" -> column index for a "Chọn đội"
// style header row (columns 0-2 are s/Name/Id, match columns start at 3).
// When the same dateTime text repeats across several columns (simultaneous
// matches), each repetition is assigned the next occurrence number in
// left-to-right order — mirroring exactly how getMatches() numbers
// same-dateTime matches in "Lịch". As long as the relative left-to-right
// order of same-time matches is consistent between the two sheets (which it
// is in this spreadsheet), this correctly tells simultaneous matches apart
// without requiring any change to either sheet's headers.
function buildHeaderColumnIndex(header) {
  const map = new Map();
  const seen = new Map();
  for (let i = 3; i < header.length; i++) {
    const label = header[i];
    if (!label) continue;
    const occurrence = seen.get(label) || 0;
    seen.set(label, occurrence + 1);
    map.set(matchColumnKey(label, occurrence), i);
  }
  return map;
}

function matchColumnKey(dateTime, occurrence) {
  return `${dateTime}|${occurrence || 0}`;
}

async function getUserPicks(userId) {
  const data = await readBetPickSheet();
  if (data.length < 2) return [];
  const header = data[0];
  const userRow = data.find((r, i) => i > 0 && String(r[2]) === String(userId));
  if (!userRow) return [];
  const seen = new Map();
  const picks = [];
  for (let i = 3; i < header.length; i++) {
    if (!header[i]) continue;
    const occurrence = seen.get(header[i]) || 0;
    seen.set(header[i], occurrence + 1);
    const val = (userRow[i] || "").trim();
    if (val && val !== "-") {
      picks.push({ dateTime: header[i], occurrence, team: val });
    }
  }
  return picks;
}

async function readBetPickSheet() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: OUTPUT_SHEET_ID,
    range: `${OUTPUT_SHEET}!A1:ZZ`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const raw = res.data.values || [];
  return raw.map((r) => r.map((c) => String(c ?? "")));
}

async function writePick(rowIdx, colIdx, value) {
  const sheets = getSheetsClient();
  const col = colIndexToLetter(colIdx);
  const range = `${OUTPUT_SHEET}!${col}${rowIdx + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: OUTPUT_SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

// Looks up the numeric sheetId (gid) for a tab name within a spreadsheet.
// Needed because cell-formatting requests (batchUpdate with repeatCell)
// address sheets by gid, not by name.
async function getSheetGid(spreadsheetId, sheetTitle) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const found = (res.data.sheets || []).find(
    (s) => s.properties && s.properties.title === sheetTitle
  );
  if (!found) throw new Error(`Sheet tab "${sheetTitle}" not found`);
  return found.properties.sheetId;
}

// Colors each user's pick cell in the "Chọn đội" sheet based on the outcome
// of the corresponding match:
//   - pick matches the winner (case-insensitive)  -> light green
//   - pick exists but doesn't match the winner     -> light red
//   - pick is blank/missing                        -> light yellow
//   - match has no winner yet (not decided)         -> no fill (reset)
// Only rows belonging to a known user (validUserIds) are touched; unknown
// rows are left completely alone. Columns are matched to matches by
// (dateTime, occurrence) so simultaneous matches are colored independently.
async function colorBetPickSheet(matches, betPickData, validUserIds) {
  if (betPickData.length < 2) return;

  const header = betPickData[0];
  const matchColMap = new Map(); // colIdx -> match (or null)
  const seen = new Map();
  for (let i = 3; i < header.length; i++) {
    if (!header[i]) continue;
    const occurrence = seen.get(header[i]) || 0;
    seen.set(header[i], occurrence + 1);
    const match = matches.find((m) => m.dateTime === header[i] && (m.occurrence || 0) === occurrence);
    matchColMap.set(i, match || null);
  }
  if (matchColMap.size === 0) return;

  const validIds = new Set(Array.from(validUserIds).map((id) => String(id)));
  const sheetId = await getSheetGid(OUTPUT_SHEET_ID, OUTPUT_SHEET);

  const requests = [];
  for (let rowIdx = 1; rowIdx < betPickData.length; rowIdx++) {
    const row = betPickData[rowIdx];
    const userId = row[2];
    if (!userId || !validIds.has(String(userId))) continue;

    for (const [colIdx, match] of matchColMap) {
      const winner = match && match.winner ? match.winner.trim() : "";
      const pick = (row[colIdx] || "").trim();

      let color;
      if (!winner) {
        color = COLOR_NONE;
      } else if (!pick || pick === "-") {
        color = COLOR_BLANK;
      } else if (pick.toLowerCase() === winner.toLowerCase()) {
        color = COLOR_WIN;
      } else {
        color = COLOR_LOSS;
      }

      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIdx,
            endRowIndex: rowIdx + 1,
            startColumnIndex: colIdx,
            endColumnIndex: colIdx + 1,
          },
          cell: {
            userEnteredFormat: { backgroundColor: color },
          },
          fields: "userEnteredFormat.backgroundColor",
        },
      });
    }
  }

  if (requests.length === 0) return;

  const sheets = getSheetsClient();
  const BATCH_SIZE = 500; // keep individual batchUpdate payloads reasonable
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const chunk = requests.slice(i, i + BATCH_SIZE);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: OUTPUT_SHEET_ID,
      requestBody: { requests: chunk },
    });
  }
}

function colIndexToLetter(idx) {
  let col = "";
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

module.exports = {
  getUsers,
  writeUserScores,
  getMatches,
  setMatches,
  readBetPickSheet,
  writePick,
  getUserPicks,
  colorBetPickSheet,
  buildHeaderColumnIndex,
  matchColumnKey,
};
