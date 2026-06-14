const DATABASE_SHEET_ID =
  process.env.DATABASE_SHEET_ID ||
  "1o9AzYElTpJ4QMmnwtdlO0GnLwmxbh3rQh6PxKoXuxSg";

const OUTPUT_SHEET_ID =
  process.env.OUTPUT_SHEET_ID ||
  process.env.DATABASE_SHEET_ID ||
  "1o9AzYElTpJ4QMmnwtdlO0GnLwmxbh3rQh6PxKoXuxSg";

const DB_USERS_SHEET = process.env.DB_USERS_SHEET || "Kết quả";
const DB_MATCHES_SHEET = process.env.DB_MATCHES_SHEET || "Lịch";
const OUTPUT_SHEET = process.env.OUTPUT_SHEET || "Chọn đội";
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

// Point coefficients per match type.
// Keys must match the value in the "Type" row of the "Scheduled match" sheet (case-insensitive).
// To adjust: edit the values below, or override via the TYPE_POINTS_JSON env var
// (JSON string, e.g. '{"group":1,"32":2,"16":3,"champion":4}').
const TYPE_POINTS = process.env.TYPE_POINTS_JSON
  ? JSON.parse(process.env.TYPE_POINTS_JSON)
  : {
    "Vòng bảng": 1,
    "32": 2,
    "16": 3,
    "Tranh cúp": 4,
    };

const DEFAULT_POINTS = 1;

module.exports = {
  DATABASE_SHEET_ID,
  OUTPUT_SHEET_ID,
  DB_USERS_SHEET,
  DB_MATCHES_SHEET,
  OUTPUT_SHEET,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  TYPE_POINTS,
  DEFAULT_POINTS,
};
