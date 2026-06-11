// ── State ────────────────────────────────────────────────────────────────────
var state = {
  matches: [],
  dayKey: null,
  allClosed: false,
  foundUser: null,
  picks: {},
  submitted: false,
  adminId: null,
  adminMatches: [],
};

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  fetchMatches();
  setInterval(fetchMatches, 60000);

  var userInput = document.getElementById('user-query');
  userInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleLookup();
  });

  document.getElementById('admin-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleAdminLogin();
  });
});

// ── Fetch matches ─────────────────────────────────────────────────────────────
function fetchMatches() {
  show('loading');
  hide('error-box');
  hide('setup-box');
  hide('no-matches-box');
  hide('matches-area');

  fetch('/api/matches')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      hide('loading');
      if (data.error === 'setup_required') {
        show('setup-box');
        return;
      }
      if (data.error) {
        showError(data.error);
        return;
      }
      state.matches = data.matches || [];
      state.dayKey = data.dayKey || null;
      state.allClosed = data.allClosed || false;
      renderMatches();
    })
    .catch(function (err) {
      hide('loading');
      showError('Failed to load matches. Please try again.');
    });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderMatches() {
  var openMatches = state.matches.filter(function (m) { return !m.closed; });
  var closedMatches = state.matches.filter(function (m) { return m.closed; });

  if (state.dayKey) {
    setText('day-key-value', state.dayKey);
    show('day-key-label');
  }

  if (state.allClosed || state.matches.length === 0) {
    show('no-matches-box');
    return;
  }

  show('matches-area');

  // Closed notice
  if (closedMatches.length > 0 && openMatches.length === 0) {
    show('closed-notice');
  } else {
    hide('closed-notice');
  }

  if (openMatches.length > 0 && !state.submitted) {
    show('user-lookup');
    renderMatchCards(openMatches);
    if (state.foundUser) {
      show('submit-area');
      updateSubmitBtn(openMatches);
    }
    hide('success-box');
  } else if (state.submitted) {
    hide('user-lookup');
    document.getElementById('match-cards').innerHTML = '';
    hide('submit-area');
    renderSuccess(openMatches);
  } else {
    hide('user-lookup');
    document.getElementById('match-cards').innerHTML = '';
    hide('submit-area');
    hide('success-box');
  }
}

function renderMatchCards(openMatches) {
  var container = document.getElementById('match-cards');
  container.innerHTML = '';
  openMatches.forEach(function (match) {
    var card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML =
      '<div class="match-time">' + escHtml(match.dateTime) + '</div>' +
      '<div class="team-grid">' +
        renderTeamBtn(match, match.team1) +
        renderTeamBtn(match, match.team2) +
      '</div>' +
      (!state.foundUser ? '<p class="pick-hint">Identify yourself above to pick a team</p>' : '');
    container.appendChild(card);
  });
}

function renderTeamBtn(match, team) {
  var selected = state.picks[match.dateTime] === team;
  var disabled = !state.foundUser ? 'disabled' : '';
  var selClass = selected ? ' selected' : '';
  return '<button class="team-btn' + selClass + '" ' + disabled +
    ' onclick="handlePickTeam(\'' + escAttr(match.dateTime) + '\', \'' + escAttr(team) + '\')">' +
    '<span class="pick-label">✓ PICKED</span>' +
    escHtml(team) +
    '</button>';
}

function renderSuccess(openMatches) {
  show('success-box');
  setText('success-name', state.foundUser ? state.foundUser.name : '');
  var picksHtml = openMatches.map(function (m) {
    return '<div class="success-pick">' + escHtml(m.dateTime) + ': <span>' + escHtml(state.picks[m.dateTime] || '') + '</span></div>';
  }).join('');
  document.getElementById('success-picks').innerHTML = '<div class="success-picks">' + picksHtml + '</div>';
}

function updateSubmitBtn(openMatches) {
  var allPicked = openMatches.length > 0 && openMatches.every(function (m) { return state.picks[m.dateTime]; });
  var btn = document.getElementById('submit-btn');
  var count = Object.keys(state.picks).length;
  btn.disabled = !allPicked;
  btn.textContent = 'Submit Picks' + (openMatches.length > 1 ? ' (' + count + '/' + openMatches.length + ')' : '');
  var hint = document.getElementById('pick-hint');
  hint.style.display = allPicked ? 'none' : '';
}

// ── User lookup ───────────────────────────────────────────────────────────────
function handleLookup() {
  var q = document.getElementById('user-query').value.trim();
  if (!q) return;
  var btn = document.getElementById('find-btn');
  btn.disabled = true;
  btn.textContent = '…';
  hide('lookup-error');
  hide('found-user');

  fetch('/api/users?q=' + encodeURIComponent(q))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.textContent = 'Find';
      if (data.found) {
        state.foundUser = data.user;
        var el = document.getElementById('found-user');
        el.innerHTML =
          '<span class="check">✓</span>' +
          '<span class="name">' + escHtml(data.user.name) + '</span>' +
          '<span class="num">#' + data.user.number + '</span>';
        show('found-user');
        // Re-render match cards with buttons enabled + show submit
        var openMatches = state.matches.filter(function (m) { return !m.closed; });
        renderMatchCards(openMatches);
        show('submit-area');
        updateSubmitBtn(openMatches);
      } else {
        showFieldError('lookup-error', 'Không có tên, vui lòng thử lại');
      }
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = 'Find';
      showFieldError('lookup-error', 'Error looking up user. Please try again.');
    });
}

// ── Pick team ─────────────────────────────────────────────────────────────────
function handlePickTeam(matchDateTime, team) {
  if (!state.foundUser) return;
  state.picks[matchDateTime] = team;
  var openMatches = state.matches.filter(function (m) { return !m.closed; });
  renderMatchCards(openMatches);
  updateSubmitBtn(openMatches);
}

// ── Submit ────────────────────────────────────────────────────────────────────
function handleSubmit() {
  if (!state.foundUser) return;
  var btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  hide('submit-error');

  fetch('/api/picks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: state.foundUser.id, picks: state.picks }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      var openMatches = state.matches.filter(function (m) { return !m.closed; });
      btn.textContent = 'Submit Picks';
      if (data.success) {
        state.submitted = true;
        renderMatches();
      } else {
        showFieldError('submit-error', data.error || 'Submission failed');
        updateSubmitBtn(openMatches);
      }
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = 'Submit Picks';
      showFieldError('submit-error', 'Submission failed. Please try again.');
    });
}

function resetAfterSubmit() {
  state.submitted = false;
  state.foundUser = null;
  state.picks = {};
  document.getElementById('user-query').value = '';
  hide('found-user');
  hide('lookup-error');
  renderMatches();
}

// ── Admin login ───────────────────────────────────────────────────────────────
function handleAdminLogin() {
  var input = document.getElementById('admin-input').value;
  hide('admin-auth-error');

  fetch('/api/admin/matches', { headers: { 'x-admin-id': input } })
    .then(function (r) {
      if (r.ok) {
        state.adminId = input;
        openAdmin();
      } else {
        showFieldError('admin-auth-error', 'Không phải admin');
      }
    })
    .catch(function () {
      showFieldError('admin-auth-error', 'Login failed. Please try again.');
    });
}

function openAdmin() {
  hide('main-view');
  show('admin-view');
  loadAdminMatches();
}

function closeAdmin() {
  show('main-view');
  hide('admin-view');
  state.adminId = null;
  document.getElementById('admin-input').value = '';
}

// ── Admin — load matches ──────────────────────────────────────────────────────
function loadAdminMatches() {
  show('admin-loading');
  hide('admin-content');

  fetch('/api/admin/matches', { headers: { 'x-admin-id': state.adminId } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      hide('admin-loading');
      if (data.error) {
        showAdminMsg('error', data.error);
        return;
      }
      state.adminMatches = data.matches || [];
      renderAdminMatches();
      show('admin-content');
    })
    .catch(function () {
      hide('admin-loading');
      showAdminMsg('error', 'Failed to load matches.');
    });
}

function renderAdminMatches() {
  var container = document.getElementById('admin-matches');
  container.innerHTML = '';
  state.adminMatches.forEach(function (match, idx) {
    container.appendChild(buildAdminMatchCard(match, idx));
  });
}

function buildAdminMatchCard(match, idx) {
  var card = document.createElement('div');
  card.className = 'admin-match-card';
  card.id = 'admin-match-' + idx;

  var hasWinner = match.winner && match.winner.trim();

  card.innerHTML =
    '<div class="admin-match-header">' +
      '<span class="admin-match-label">Match ' + (idx + 1) + '</span>' +
      '<button class="remove-btn" onclick="removeMatch(' + idx + ')">Remove</button>' +
    '</div>' +
    '<input type="text" placeholder="Date &amp; Time (e.g. 12/06/2026 2am)" value="' + escAttr(match.dateTime) + '" oninput="updateMatch(' + idx + ', \'dateTime\', this.value)" />' +
    '<div class="two-col">' +
      '<input type="text" placeholder="Team 1" value="' + escAttr(match.team1) + '" oninput="updateMatch(' + idx + ', \'team1\', this.value)" />' +
      '<input type="text" placeholder="Team 2" value="' + escAttr(match.team2) + '" oninput="updateMatch(' + idx + ', \'team2\', this.value)" />' +
    '</div>' +
    '<div class="winner-row">' +
      '<input type="text" placeholder="Winner (leave blank if not played yet)" value="' + escAttr(match.winner || '') + '" oninput="updateMatch(' + idx + ', \'winner\', this.value)" />' +
      (hasWinner ? '<span class="winner-set-badge">✓ Winner set</span>' : '') +
    '</div>';

  return card;
}

function addMatch() {
  state.adminMatches.push({ dateTime: '', team1: '', team2: '', winner: '' });
  renderAdminMatches();
}

function removeMatch(idx) {
  state.adminMatches.splice(idx, 1);
  renderAdminMatches();
}

function updateMatch(idx, field, value) {
  state.adminMatches[idx][field] = value;
  // Update winner badge without full re-render
  var card = document.getElementById('admin-match-' + idx);
  if (card && field === 'winner') {
    var badge = card.querySelector('.winner-set-badge');
    var row = card.querySelector('.winner-row');
    if (value.trim()) {
      if (!badge) {
        var b = document.createElement('span');
        b.className = 'winner-set-badge';
        b.textContent = '✓ Winner set';
        row.appendChild(b);
      }
    } else {
      if (badge) badge.remove();
    }
  }
}

function handleSave() {
  var btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  clearAdminMsgs();

  var cleaned = state.adminMatches.filter(function (m) {
    return m.dateTime.trim() && m.team1.trim() && m.team2.trim();
  });

  fetch('/api/admin/matches', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-id': state.adminId,
    },
    body: JSON.stringify({ matches: cleaned }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.textContent = 'Save Match Schedule';
      if (data.success) {
        state.adminMatches = cleaned;
        renderAdminMatches();
        showAdminMsg('success', 'Match schedule saved!');
      } else {
        showAdminMsg('error', data.error || 'Save failed');
      }
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = 'Save Match Schedule';
      showAdminMsg('error', 'Save failed. Please try again.');
    });
}

function handleRecalculate() {
  var btn = document.getElementById('recalc-btn');
  btn.disabled = true;
  btn.textContent = 'Calculating…';
  clearAdminMsgs();

  fetch('/api/admin/score', {
    method: 'POST',
    headers: { 'x-admin-id': state.adminId },
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.textContent = '🏆 Recalculate Scores';
      if (data.success) {
        showAdminMsg('success', 'Scores recalculated and written to Result sheet!');
      } else {
        showAdminMsg('error', data.error || 'Score update failed');
      }
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = '🏆 Recalculate Scores';
      showAdminMsg('error', 'Failed. Please try again.');
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function show(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = '';
}
function hide(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}
function showError(msg) {
  var el = document.getElementById('error-box');
  el.textContent = msg;
  show('error-box');
}
function showFieldError(id, msg) {
  var el = document.getElementById(id);
  el.textContent = msg;
  show(id);
}
function showAdminMsg(type, msg) {
  if (type === 'error') {
    var el = document.getElementById('admin-error');
    el.textContent = msg;
    show('admin-error');
  } else {
    var el2 = document.getElementById('admin-success');
    el2.textContent = msg;
    show('admin-success');
  }
}
function clearAdminMsgs() {
  hide('admin-error');
  hide('admin-success');
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
