const { getMatches, getUsers } = require("./_lib/sheets");
const { parseMatchDate, isCutoffPassed } = require("./_lib/matches");
const { submitPick } = require("./_lib/output");

module.exports = async function handler(req, res) {
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
        return res.status(400).json({ error: `Submissions for "${matchDateTime}" are closed (3h before match)` });
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
