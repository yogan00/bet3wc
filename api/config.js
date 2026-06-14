const { DATABASE_SHEET_ID } = require("./_lib/config");
const appConfig = require("../config");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const mins = typeof appConfig.SUBMIT_CUTOFF_MINUTES === 'number' ? appConfig.SUBMIT_CUTOFF_MINUTES : 180;
  res.json({
    sheetUrl: `https://docs.google.com/spreadsheets/d/${DATABASE_SHEET_ID}/view`,
    submitCutoffMinutes: mins,
  });
};
