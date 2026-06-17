const {
  getMatches,
  getUsers,
  readBetPickSheet,
  writePick,
  writeUserScores,
  colorBetPickSheet,
  buildHeaderColumnIndex,
  matchColumnKey,
} = require("./sheets");
const { TYPE_POINTS, DEFAULT_POINTS } = require("./config");

async function submitPick(userId, matchDateTime, occurrence, teamPick) {
  const data = await readBetPickSheet();
  if (data.length === 0) throw new Error("Bet pick sheet is empty");

  const header = data[0];
  const headerIndex = buildHeaderColumnIndex(header);
  const matchColIdx = headerIndex.get(matchColumnKey(matchDateTime, occurrence));
  if (matchColIdx === undefined)
    throw new Error(`Match "${matchDateTime}" not found in Bet pick sheet`);

  let userRowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(userId)) {
      userRowIdx = i;
      break;
    }
  }
  if (userRowIdx === -1)
    throw new Error(`User ID "${userId}" not found in Bet pick sheet`);

  await writePick(userRowIdx, matchColIdx, teamPick);
}

async function computeAndWriteScores() {
  const [matches, betPickData, users] = await Promise.all([
    getMatches(),
    readBetPickSheet(),
    getUsers(),
  ]);

  const decided = matches.filter((m) => m.winner && m.winner.trim() !== "");
  if (decided.length === 0 || betPickData.length < 2) return;

  const header = betPickData[0];
  const headerIndex = buildHeaderColumnIndex(header);

  let decidedCount = 0;
  for (const match of decided) {
    if (headerIndex.get(matchColumnKey(match.dateTime, match.occurrence)) === undefined) continue;
    decidedCount++;
  }

  const scores = [];
  for (let rowIdx = 1; rowIdx < betPickData.length; rowIdx++) {
    const row = betPickData[rowIdx];
    const id = row[2];
    if (!id) continue;

    let won = 0;
    let lost = 0;
    let winCount = 0;
    let voteCount = 0;
    for (const match of decided) {
      const colIdx = headerIndex.get(matchColumnKey(match.dateTime, match.occurrence));
      if (colIdx === undefined) continue;
      const winner = (match.winner || "").trim();

      const pick = (row[colIdx] || "").trim();

      const type = (match.type || "").trim().toLowerCase();
      const points = TYPE_POINTS[type] !== undefined ? TYPE_POINTS[type] : DEFAULT_POINTS;

      const isVote = pick && pick !== "-";
      if (isVote) {
        voteCount++;
        if (pick === winner) { won += points; winCount++; }
        else lost += points;
      } else {
        lost += points;
      }
    }
    scores.push({ rowIdx, won, lost, winCount, voteCount, decidedCount });
  }

  await writeUserScores(scores);

  const validUserIds = users.map((u) => u.id);
  await colorBetPickSheet(matches, betPickData, validUserIds);
}

module.exports = { submitPick, computeAndWriteScores };
