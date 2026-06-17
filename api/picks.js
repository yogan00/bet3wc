const { getMatches, getUsers, getUserPicks } = require("./_lib/sheets");
const { parseMatchDate, isCutoffPassed } = require("./_lib/matches");
const { submitPick } = require("./_lib/output");
const config = require("../config");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const userId = (req.query.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    try {
      // getUserPicks now returns an array of { dateTime, occurrence, team }
      // rather than an object keyed by dateTime, since dateTime alone isn't
      // unique when matches share a kickoff time.
      const picks = await getUserPicks(userId);
      return res.json({ picks });
    } catch (err) {
      return res.status(500).json({ error: "Server error" });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId, picks } = req.body;

    // picks is now an array of { dateTime, occurrence, team } entries
    // instead of an object keyed by dateTime, so that two matches sharing
    // the same dateTime (simultaneous kickoffs) can both be submitted
    // correctly instead of one silently overwriting the other.
    if (!userId || !Array.isArray(picks)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const users = await getUsers();
    const user = users.find((u) => String(u.id) === String(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const matches = await getMatches();
    for (const entry of picks) {
      const matchDateTime = entry && entry.dateTime;
      const occurrence = (entry && entry.occurrence) || 0;
      const teamPick = entry && entry.team;

      const match = matches.find((m) => m.dateTime === matchDateTime && (m.occurrence || 0) === occurrence);
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

    for (const entry of picks) {
      await submitPick(String(userId), entry.dateTime, entry.occurrence || 0, entry.team);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
