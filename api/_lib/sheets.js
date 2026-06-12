const { google } = require("googleapis");
const {
  GOOGLE_SERVICE_ACCOUNT_JSON,
  DATABASE_SHEET_ID,
  OUTPUT_SHEET_ID,
  DB_USERS_SHEET,
  DB_MATCHES_SHEET,
  OUTPUT_SHEET,
} = require("./config");

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
  const data = scores.map((s) => ({
    range: `${DB_USERS_SHEET}!D${s.rowIdx + 1}:E${s.rowIdx + 1}`,
    values: [[s.won, s.lost]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: DATABASE_SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

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
  for (let i = 1; i < dtRow.length; i++) {
    const dateTime = dtRow[i];
    const team1    = t1Row[i];
    const team2    = t2Row[i];
    if (dateTime && team1 && team2) {
      matches.push({
        dateTime: String(dateTime),
        team1:    String(team1),
        team2:    String(team2),
        winner:   wRow[i]        ? String(wRow[i])        : undefined,
        type:     typeRow[i]     ? String(typeRow[i])     : undefined,
        handicap: handicapRow[i] ? String(handicapRow[i]) : undefined,
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
};
