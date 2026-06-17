const { getMatches } = require("./_lib/sheets");
const { getNearestMatchDay, getMatchesForDay, getMatchesInLookahead, getDateKey, parseMatchDate, isCutoffPassed } = require("./_lib/matches");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const matches = await getMatches();
    const dayParam = (req.query.day || "").trim();

    let dayMatches, dayKey;
    if (dayParam) {
      dayKey = dayParam;
      dayMatches = getMatchesForDay(matches, dayKey);
    } else {
      dayMatches = getMatchesInLookahead(matches);
      dayKey = dayMatches.length > 0
        ? getDateKey(parseMatchDate(dayMatches[0].dateTime))
        : getNearestMatchDay(matches);
    }

    if (!dayKey && dayMatches.length === 0) {
      return res.json({ matches: [], dayKey: null, allClosed: true });
    }

    const result = dayMatches.map((m) => {
      const date = parseMatchDate(m.dateTime);
      const closed = date ? isCutoffPassed(date) : true;
      // `occurrence` distinguishes matches that share the exact same
      // dateTime (simultaneous kickoffs). The frontend needs it to keep
      // each match's pick state separate; the API needs it to find the
      // right column in the "Chọn đội" sheet when a pick is submitted.
      return { dateTime: m.dateTime, occurrence: m.occurrence || 0, team1: m.team1, team2: m.team2, closed, handicap: m.handicap || "" };
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
