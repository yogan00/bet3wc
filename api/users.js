const { getUsers } = require("./_lib/sheets");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const query = (req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const users = await getUsers();
    const q = query.toLowerCase();

    const match = users.find((u) => {
      if (String(u.number) === q) return true;
      const idStr = String(u.id);
      if (idStr.length >= 4 && idStr.slice(-4) === q) return true;
      if (idStr === q) return true;
      return false;
    });

    if (!match) return res.json({ found: false });
    res.json({ found: true, user: match });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
