const { getMatches, readBetPickSheet, writePick, writeUserScores } = require("./sheets");

async function submitPick(userId, matchDateTime, teamPick) {
  const data = await readBetPickSheet();
  if (data.length === 0) throw new Error("Bet pick sheet is empty");

  const header = data[0];
  const matchColIdx = header.findIndex((h, i) => i >= 3 && h === matchDateTime);
  if (matchColIdx === -1)
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
  const [matches, betPickData] = await Promise.all([
    getMatches(),
    readBetPickSheet(),
  ]);

  const decided = matches.filter((m) => m.winner && m.winner.trim() !== "");
  if (decided.length === 0) return;
  if (betPickData.length < 2) return;

  const header = betPickData[0];
  const matchColMap = new Map();
  for (let i = 3; i < header.length; i++) {
    if (header[i]) matchColMap.set(header[i], i);
  }

  const scores = [];
  for (let rowIdx = 1; rowIdx < betPickData.length; rowIdx++) {
    const row = betPickData[rowIdx];
    const id = row[2];
    if (!id) continue;

    let won = 0;
    let lost = 0;
    for (const match of decided) {
      const colIdx = matchColMap.get(match.dateTime);
      if (colIdx === undefined) continue;
      const pick = (row[colIdx] || "").trim();
      if (!pick || pick === "-") continue;
      if (pick === match.winner) won++;
      else lost++;
    }
    scores.push({ rowIdx, won, lost });
  }

  await writeUserScores(scores);
}

module.exports = { submitPick, computeAndWriteScores };
