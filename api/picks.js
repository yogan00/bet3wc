const { getMatches, getUsers, getUserPicks } = require("./_lib/sheets");
const { parseMatchDate, isCutoffPassed } = require("./_lib/matches");
const { submitPick } = require("./_lib/output");
const config = require("../config");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const userId = (req.query.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    try {
      const picks = await getUserPicks(userId);
      return res.json({ picks });
    } catch (err) {
      return res.status(500).json({ error: "Server error" });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId, picks } = req.body;

    if (!userId || !picks || typeof picks !== "object") {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const users = await getUsers();
    const user = users.find((u) => String(u.id) === String(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const matches = await getMatches();
    for (const [matchDateTime, teamPick] of Object.entries(picks)) {
      const match = matches.find((m) => m.dateTime === matchDateTime);
      if (!match) return res.status(400).json({ error: `Match "${matchDateTime}" not found` });
      const date = parseMatchDate(matchDateTime);
      if (date && isCutoffPassed(date)) {
        const mins = typeof config.SUBMIT_CUTOFF_MINUTES === 'number' ? config.SUBMIT_CUTOFF_MINUTES : 180;
        const cutoffDesc = mins >= 0 ? `${mins} min before match` : `${Math.abs(mins)} min after match starts`;
        return res.status(400).json({ error: `Submissions for "${matchDateTime}" are closed (${cutoffDesc})` });
      }
      if (teamPick !== match.team1 && teamPick !== match.team2) {
        return res.status(400).json({ error: `Invalid team "${teamPick}" for match "${matchDateTime}"` });
      }
    }

    for (const [matchDateTime, teamPick] of Object.entries(picks)) {
      await submitPick(String(userId), matchDateTime, teamPick);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
