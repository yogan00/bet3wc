const { toZonedTime, fromZonedTime } = require("date-fns-tz");
const { parseISO, parse, isValid } = require("date-fns");
const config = require("../../config");

const TZ = "Asia/Bangkok";

function parseMatchDate(dateTimeStr) {
  const raw = dateTimeStr.trim();

  const normalized = raw.replace(
    /(\d{1,2})(am|pm)$/i,
    (_, h, ampm) => `${h}:00 ${ampm.toUpperCase()}`
  );

  const formats = [
    "dd/MM/yyyy h:mm aa",
    "MM/dd/yyyy h:mm aa",
    "d/M/yyyy h:mm aa",
    "MM/dd/yyyy HH:mm",
    "dd/MM/yyyy HH:mm",
    "yyyy-MM-dd HH:mm",
    "M/d/yyyy HH:mm",
    "MM/dd/yyyy  h:mm aa",
    "dd/MM/yyyy  h:mm aa",
    "M/d/yyyy  h:mm aa",
  ];

  try {
    const d = parseISO(raw);
    if (isValid(d)) return d;
  } catch (_) {}

  for (const fmt of formats) {
    for (const src of [normalized, raw]) {
      try {
        const d = parse(src, fmt, new Date());
        if (isValid(d)) return fromZonedTime(d, TZ);
      } catch (_) {}
    }
  }

  const d = new Date(raw);
  if (isValid(d)) return d;
  return null;
}

function isCutoffPassed(matchDate) {
  const minutes = typeof config.SUBMIT_CUTOFF_MINUTES === 'number' ? config.SUBMIT_CUTOFF_MINUTES : 180;
  const cutoff = new Date(matchDate.getTime() - minutes * 60 * 1000);
  return new Date() >= cutoff;
}

function getDateKey(date) {
  const z = toZonedTime(date, TZ);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

function getNearestMatchDay(matches) {
  const parsed = [];
  for (const m of matches) {
    const d = parseMatchDate(m.dateTime);
    if (!d) continue;
    parsed.push({ match: m, date: d, key: getDateKey(d) });
  }

  const upcoming = parsed.filter(({ date }) => !isCutoffPassed(date));
  if (upcoming.length === 0) return null;

  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  return upcoming[0].key;
}

function getMatchesForDay(matches, dayKey) {
  return matches.filter((m) => {
    const d = parseMatchDate(m.dateTime);
    if (!d) return false;
    return getDateKey(d) === dayKey;
  });
}

function getAllMatchDays(matches) {
  const seen = new Set();
  for (const m of matches) {
    const d = parseMatchDate(m.dateTime);
    if (!d) continue;
    seen.add(getDateKey(d));
  }
  return Array.from(seen).sort();
}

function getMatchesInLookahead(matches) {
  const hours = typeof config.MATCH_LOOKAHEAD_HOURS === 'number' ? config.MATCH_LOOKAHEAD_HOURS : 24;
  const horizon = new Date(Date.now() + hours * 60 * 60 * 1000);
  return matches.filter((m) => {
    const d = parseMatchDate(m.dateTime);
    if (!d) return false;
    return !isCutoffPassed(d) && d <= horizon;
  });
}

module.exports = {
  parseMatchDate,
  isCutoffPassed,
  getDateKey,
  getNearestMatchDay,
  getMatchesForDay,
  getAllMatchDays,
  getMatchesInLookahead,
};
