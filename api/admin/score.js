const { isAdminId } = require("../_lib/admin");
const { computeAndWriteScores } = require("../_lib/output");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const adminId = req.headers["x-admin-id"] || "";
  if (!isAdminId(adminId)) return res.status(401).json({ error: "Unauthorized" });

  try {
    await computeAndWriteScores();
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    res.status(500).json({ error: msg });
  }
};
