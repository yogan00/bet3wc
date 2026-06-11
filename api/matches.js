const { getMatches } = require("./_lib/sheets");
const { getNearestMatchDay, getMatchesForDay, parseMatchDate, isCutoffPassed } = require("./_lib/matches");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const matches = await getMatches();
    const dayParam = (req.query.day || "").trim();
    const dayKey = dayParam || getNearestMatchDay(matches);

    if (!dayKey) {
      return res.json({ matches: [], dayKey: null, allClosed: true });
    }

    const dayMatches = getMatchesForDay(matches, dayKey);
    const result = dayMatches.map((m) => {
      const date = parseMatchDate(m.dateTime);
      const closed = date ? isCutoffPassed(date) : true;
      return { dateTime: m.dateTime, team1: m.team1, team2: m.team2, closed };
    });

    res.json({ matches: result, dayKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const isSetup = msg.includes("GOOGLE_SERVICE_ACCOUNT_JSON") || msg.includes("not set");
    res.status(isSetup ? 200 : 500).json({
      error: isSetup ? "setup_required" : msg,
      matches: [],
      dayKey: null,
      allClosed: false,
    });
  }
};
