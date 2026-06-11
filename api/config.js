const { DATABASE_SHEET_ID } = require("./_lib/config");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.json({
    sheetUrl: `https://docs.google.com/spreadsheets/d/${DATABASE_SHEET_ID}/view`,
  });
};
