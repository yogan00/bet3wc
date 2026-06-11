const { getMatches, setMatches } = require("../_lib/sheets");
const { isAdminId } = require("../_lib/admin");

module.exports = async function handler(req, res) {
  const adminId = req.headers["x-admin-id"] || "";
  if (!isAdminId(adminId)) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    try {
      const matches = await getMatches();
      res.json({ matches });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const { matches } = req.body;
      if (!Array.isArray(matches)) return res.status(400).json({ error: "matches must be an array" });
      await setMatches(matches);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
