const { getMatches } = require("./_lib/sheets");
const { getNearestMatchDay, getAllMatchDays } = require("./_lib/matches");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const matches = await getMatches();
    const days = getAllMatchDays(matches);
    const nearestDay = getNearestMatchDay(matches);
    res.json({ days, nearestDay });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const isSetup = msg.includes("GOOGLE_SERVICE_ACCOUNT_JSON") || msg.includes("not set");
    res.status(isSetup ? 200 : 500).json({ error: isSetup ? "setup_required" : msg });
  }
};
