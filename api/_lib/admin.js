function isAdminId(inputId) {
  const adminIds = process.env.ADMIN_IDS || "";
  const ids = adminIds
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ids.includes(inputId.trim().toLowerCase());
}

module.exports = { isAdminId };
