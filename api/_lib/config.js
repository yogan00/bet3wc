const DATABASE_SHEET_ID =
  process.env.DATABASE_SHEET_ID ||
  "1o9AzYElTpJ4QMmnwtdlO0GnLwmxbh3rQh6PxKoXuxSg";

const OUTPUT_SHEET_ID =
  process.env.OUTPUT_SHEET_ID ||
  process.env.DATABASE_SHEET_ID ||
  "1o9AzYElTpJ4QMmnwtdlO0GnLwmxbh3rQh6PxKoXuxSg";

const DB_USERS_SHEET = process.env.DB_USERS_SHEET || "Result";
const DB_MATCHES_SHEET = process.env.DB_MATCHES_SHEET || "Scheduled match";
const OUTPUT_SHEET = process.env.OUTPUT_SHEET || "Bet pick";
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

module.exports = {
  DATABASE_SHEET_ID,
  OUTPUT_SHEET_ID,
  DB_USERS_SHEET,
  DB_MATCHES_SHEET,
  OUTPUT_SHEET,
  GOOGLE_SERVICE_ACCOUNT_JSON,
};
