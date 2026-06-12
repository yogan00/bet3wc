// ── State ────────────────────────────────────────────────────────────────────
var state = {
  matches: [],
  dayKey: null,
  allClosed: false,
  allDays: [],
  nearestDay: null,
  selectedDay: null,
  calendarOpen: false,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  sheetUrl: null,
  foundUser: null,
  picks: {},
  submitted: false,
  adminId: null,
  adminMatches: [],
};

var MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  fetchDaysAndConfig();

  document.getElementById('user-query').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleLookup();
  });
  document.getElementById('admin-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleAdminLogin();
  });

  // Close calendar on outside click
  document.addEventListener('mousedown', function (e) {
    if (!state.calendarOpen) return;
    var popup = document.getElementById('calendar-popup');
    var btn = document.getElementById('date-trigger-btn');
    if (popup && !popup.contains(e.target) && btn && !btn.contains(e.target)) {
      closeCalendar();
    }
  });
});

// ── Days + config ─────────────────────────────────────────────────────────────
function fetchDaysAndConfig() {
  Promise.all([
    fetch('/api/days').then(function (r) { return r.json(); }),
    fetch('/api/config').then(function (r) { return r.json(); }),
  ]).then(function (results) {
    var daysData = results[0];
    var configData = results[1];

    if (!daysData.error) {
      state.allDays = daysData.days || [];
      state.nearestDay = daysData.nearestDay || null;
      if (!state.selectedDay) state.selectedDay = state.nearestDay;
    }

    if (configData.sheetUrl) {
      state.sheetUrl = configData.sheetUrl;
      document.getElementById('sheet-link').href = configData.sheetUrl;
      show('sheet-link-wrap');
    }

    updateDateTrigger();
    fetchMatches();
    setInterval(fetchMatches, 60000);
  }).catch(function () {
    fetchMatches();
    setInterval(fetchMatches, 60000);
  });
}

// ── Date trigger ──────────────────────────────────────────────────────────────
function updateDateTrigger() {
  var activeDay = state.selectedDay || state.nearestDay;
  if (!activeDay) { hide('date-trigger-wrap'); return; }
  show('date-trigger-wrap');
  setText('date-trigger-label', formatDayLabel(activeDay));
}

function toggleCalendar() {
  if (state.calendarOpen) { closeCalendar(); } else { openCalendar(); }
}

function openCalendar() {
  var activeDay = state.selectedDay || state.nearestDay;
  if (activeDay) {
    var parts = activeDay.split('-');
    state.calYear = Number(parts[0]);
    state.calMonth = Number(parts[1]);
  }
  state.calendarOpen = true;
  renderCalendar();
  show('calendar-popup');
  setText('date-trigger-arrow', '▲');
}

function closeCalendar() {
  state.calendarOpen = false;
  hide('calendar-popup');
  setText('date-trigger-arrow', '▼');
}

function calPrevMonth() {
  if (state.calMonth === 1) { state.calYear--; state.calMonth = 12; }
  else { state.calMonth--; }
  renderCalendar();
}

function calNextMonth() {
  if (state.calMonth === 12) { state.calYear++; state.calMonth = 1; }
  else { state.calMonth++; }
  renderCalendar();
}

function renderCalendar() {
  var y = state.calYear;
  var m = state.calMonth;
  setText('cal-month-label', MONTH_NAMES[m - 1] + ' ' + y);

  var daysInMonth = new Date(y, m, 0).getDate();
  var startDow = new Date(y, m - 1, 1).getDay();
  var activeDay = state.selectedDay || state.nearestDay;

  var grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // leading blanks
  for (var blank = 0; blank < startDow; blank++) {
    var emptyCell = document.createElement('div');
    grid.appendChild(emptyCell);
  }

  // day cells
  for (var d = 1; d <= daysInMonth; d++) {
    var key = toKey(y, m, d);
    var hasMatch = state.allDays.indexOf(key) !== -1;
    var isSelected = key === activeDay;

    var cell = document.createElement('button');
    cell.textContent = String(d);
    cell.className = 'cal-day' +
      (isSelected ? ' cal-selected' : hasMatch ? ' cal-has-match' : ' cal-no-match');
    cell.disabled = !hasMatch;

    if (hasMatch) {
      (function (k) {
        cell.onclick = function () { switchDay(k); };
      })(key);
    }

    grid.appendChild(cell);
  }
}

function toKey(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function formatDayLabel(key) {
  var parts = key.split('-');
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();
}

function switchDay(day) {
  state.selectedDay = day;
  state.submitted = false;
  state.foundUser = null;
  state.picks = {};
  document.getElementById('user-query').value = '';
  hide('found-user');
  hide('lookup-error');
  closeCalendar();
  updateDateTrigger();
  fetchMatches();
}

// ── Fetch matches ─────────────────────────────────────────────────────────────
function fetchMatches() {
  show('loading');
  hide('error-box');
  hide('setup-box');
  hide('no-matches-box');
  hide('matches-area');

  var url = '/api/matches';
  if (state.selectedDay) url += '?day=' + encodeURIComponent(state.selectedDay);

  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      hide('loading');
      if (data.error === 'setup_required') { show('setup-box'); return; }
      if (data.error) { showError(data.error); return; }
      state.matches = data.matches || [];
      state.dayKey = data.dayKey || null;
      state.allClosed = data.allClosed || false;
      renderMatches();
    })
    .catch(function () {
      hide('loading');
      showError('Failed to load matches. Please try again.');
    });
}

// ── Render matches ────────────────────────────────────────────────────────────
function renderMatches() {
  var openMatches = state.matches.filter(function (m) { return !m.closed; });
  var closedMatches = state.matches.filter(function (m) { return m.closed; });

  if (state.allClosed || state.matches.length === 0) { show('no-matches-box'); return; }

  show('matches-area');

  if (closedMatches.length > 0 && openMatches.length === 0) show('closed-notice');
  else hide('closed-notice');

  if (openMatches.length > 0 && !state.submitted) {
    show('user-lookup');
    renderMatchCards(openMatches);
    if (state.foundUser) { show('submit-area'); updateSubmitBtn(openMatches); }
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
      (!state.foundUser ? '<p class="pick-hint">Điền thông tin trước khi bắt kèo</p>' : '');
    container.appendChild(card);
  });
}

function renderTeamBtn(match, team) {
  var selected = state.picks[match.dateTime] === team;
  var disabled = !state.foundUser ? 'disabled' : '';
  var selClass = selected ? ' selected' : '';
  return '<button class="team-btn' + selClass + '" ' + disabled +
    ' onclick="handlePickTeam(\'' + escAttr(match.dateTime) + '\', \'' + escAttr(team) + '\')">' +
    '<span class="pick-label">✓ PICKED</span>' + escHtml(team) + '</button>';
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
  btn.textContent = 'Chốt đơn' + (openMatches.length > 1 ? ' (' + count + '/' + openMatches.length + ')' : '');
  document.getElementById('pick-hint').style.display = allPicked ? 'none' : '';
}

// ── User lookup ───────────────────────────────────────────────────────────────
function handleLookup() {
  var q = document.getElementById('user-query').value.trim();
  if (!q) return;
  var btn = document.getElementById('find-btn');
  btn.disabled = true; btn.textContent = '…';
  hide('lookup-error'); hide('found-user');

  fetch('/api/users?q=' + encodeURIComponent(q))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false; btn.textContent = 'Kiểm tra';
      if (data.found) {
        state.foundUser = data.user;
        document.getElementById('found-user').innerHTML =
          '<span class="check">✓</span>' +
          '<span class="name">' + escHtml(data.user.name) + '</span>' +
          '<span class="num">#' + data.user.number + '</span>';
        show('found-user');
        var openMatches = state.matches.filter(function (m) { return !m.closed; });
        renderMatchCards(openMatches);
        show('submit-area');
        updateSubmitBtn(openMatches);
      } else {
        showFieldError('lookup-error', 'Không có tên, vui lòng thử lại');
      }
    })
    .catch(function () {
      btn.disabled = false; btn.textContent = 'Kiểm tra';
      showFieldError('lookup-error', 'Không có tên, vui lòng thử lại');
    });
}

function handlePickTeam(matchDateTime, team) {
  if (!state.foundUser) return;
  state.picks[matchDateTime] = team;
  var openMatches = state.matches.filter(function (m) { return !m.closed; });
  renderMatchCards(openMatches);
  updateSubmitBtn(openMatches);
}

function handleSubmit() {
  if (!state.foundUser) return;
  var btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = 'Đang chốt đơn…';
  hide('submit-error');

  fetch('/api/picks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: state.foundUser.id, picks: state.picks }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.textContent = 'Chốt đơn';
      var openMatches = state.matches.filter(function (m) { return !m.closed; });
      if (data.success) { state.submitted = true; renderMatches(); }
      else { showFieldError('submit-error', data.error || 'Submission failed'); updateSubmitBtn(openMatches); }
    })
    .catch(function () {
      btn.disabled = false; btn.textContent = 'Chốt đơn';
      showFieldError('Chốt lỗi', 'Đơn chưa chốt, kèo chưa vô, vui lòng thử lại');
    });
}

function resetAfterSubmit() {
  state.submitted = false; state.foundUser = null; state.picks = {};
  document.getElementById('user-query').value = '';
  hide('found-user'); hide('lookup-error');
  renderMatches();
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function handleAdminLogin() {
  var input = document.getElementById('admin-input').value;
  hide('admin-auth-error');
  fetch('/api/admin/matches', { headers: { 'x-admin-id': input } })
    .then(function (r) {
      if (r.ok) { state.adminId = input; openAdmin(); }
      else showFieldError('admin-auth-error', 'Không phải admin');
    })
    .catch(function () { showFieldError('admin-auth-error', 'Login failed.'); });
}

function openAdmin() { hide('main-view'); show('admin-view'); show('scroll-end-btn'); loadAdminMatches(); }
function closeAdmin() { show('main-view'); hide('admin-view'); hide('scroll-end-btn'); state.adminId = null; document.getElementById('admin-input').value = ''; }

function loadAdminMatches() {
  show('admin-loading'); hide('admin-content');
  fetch('/api/admin/matches', { headers: { 'x-admin-id': state.adminId } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      hide('admin-loading');
      if (data.error) { showAdminMsg('error', data.error); return; }
      state.adminMatches = data.matches || [];
      renderAdminMatches(); show('admin-content');
    })
    .catch(function () { hide('admin-loading'); showAdminMsg('error', 'Failed to load matches.'); });
}

function renderAdminMatches() {
  var container = document.getElementById('admin-matches');
  container.innerHTML = '';
  state.adminMatches.forEach(function (match, idx) { container.appendChild(buildAdminMatchCard(match, idx)); });
}

var TYPE_OPTIONS = [
  { value: '', label: 'Type (optional)' },
  { value: 'group', label: 'Group (+1 pt)' },
  { value: '32', label: 'Round of 32 (+2 pts)' },
  { value: '16', label: 'Round of 16 (+3 pts)' },
  { value: 'champion', label: 'Champion (+4 pts)' },
];

function buildTypeSelect(idx, currentType) {
  var opts = TYPE_OPTIONS.map(function (o) {
    var sel = (o.value === (currentType || '')) ? ' selected' : '';
    return '<option value="' + escAttr(o.value) + '"' + sel + '>' + escHtml(o.label) + '</option>';
  }).join('');
  return '<select class="type-select" onchange="updateMatch(' + idx + ', \'type\', this.value)">' + opts + '</select>';
}

function parseAdminDate(str) {
  if (!str || !str.trim()) return null;
  var s = str.trim();
  // Try ISO first
  var d = new Date(s);
  if (!isNaN(d)) return d;
  // Handle "dd/MM/yyyy h:mma" or "dd/MM/yyyy HH:mm" style
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (m) {
    var day = +m[1], mon = +m[2], yr = +m[3], hr = +m[4], min = +(m[5] || 0), ampm = (m[6] || '').toLowerCase();
    if (ampm === 'pm' && hr < 12) hr += 12;
    if (ampm === 'am' && hr === 12) hr = 0;
    return new Date(yr, mon - 1, day, hr, min);
  }
  return null;
}

function isAdminMatchPast(dateTimeStr) {
  var d = parseAdminDate(dateTimeStr);
  if (!d) return false;
  return new Date() > d;
}

function buildAdminMatchCard(match, idx) {
  var card = document.createElement('div');
  var past = isAdminMatchPast(match.dateTime);
  card.className = 'admin-match-card' + (past ? ' admin-match-card--past' : '');
  card.id = 'admin-match-' + idx;
  var hasWinner = match.winner && match.winner.trim();
  var lockedAttr = past ? ' disabled' : '';
  card.innerHTML =
    '<div class="admin-match-header"><span class="admin-match-label">Match ' + (idx + 1) + (past ? ' <span class="past-badge">PAST</span>' : '') + '</span>' +
    '<button class="remove-btn" onclick="removeMatch(' + idx + ')">Remove</button></div>' +
    '<input type="text" placeholder="Date &amp; Time (e.g. 12/06/2026 2am)" value="' + escAttr(match.dateTime) + '" oninput="updateMatch(' + idx + ', \'dateTime\', this.value)"' + lockedAttr + ' />' +
    '<div class="two-col">' +
    '<input type="text" placeholder="Team 1" value="' + escAttr(match.team1) + '" oninput="updateMatch(' + idx + ', \'team1\', this.value)"' + lockedAttr + ' />' +
    '<input type="text" placeholder="Team 2" value="' + escAttr(match.team2) + '" oninput="updateMatch(' + idx + ', \'team2\', this.value)"' + lockedAttr + ' /></div>' +
    '<div class="two-col">' +
    '<div class="winner-row"><input type="text" placeholder="Winner (blank if not played yet)" value="' + escAttr(match.winner || '') + '" oninput="updateMatch(' + idx + ', \'winner\', this.value)" />' +
    (hasWinner ? '<span class="winner-set-badge">✓</span>' : '') + '</div>' +
    buildTypeSelect(idx, match.type) +
    '</div>';
  return card;
}

function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function addMatch() { state.adminMatches.push({ dateTime: '', team1: '', team2: '', winner: '', type: '' }); renderAdminMatches(); }
function removeMatch(idx) { state.adminMatches.splice(idx, 1); renderAdminMatches(); }

function updateMatch(idx, field, value) {
  state.adminMatches[idx][field] = value;
  if (field === 'winner') {
    var card = document.getElementById('admin-match-' + idx);
    if (card) {
      var badge = card.querySelector('.winner-set-badge');
      var row = card.querySelector('.winner-row');
      if (value.trim()) {
        if (!badge) { var b = document.createElement('span'); b.className = 'winner-set-badge'; b.textContent = '✓ Đã chọn đội thắng kèo'; row.appendChild(b); }
      } else { if (badge) badge.remove(); }
    }
  }
}

function handleSave() {
  var btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = 'Đang lưu…'; clearAdminMsgs();
  var cleaned = state.adminMatches.filter(function (m) { return m.dateTime.trim() && m.team1.trim() && m.team2.trim(); });
  fetch('/api/admin/matches', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-id': state.adminId },
    body: JSON.stringify({ matches: cleaned }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false; btn.textContent = 'Lưu lịch thi đấu';
      if (data.success) { state.adminMatches = cleaned; renderAdminMatches(); showAdminMsg('success', 'Match schedule saved!'); }
      else showAdminMsg('error', data.error || 'Save failed');
    })
    .catch(function () { btn.disabled = false; btn.textContent = 'Lưu lịch thi đấu'; showAdminMsg('error', 'Save failed.'); });
}

function handleRecalculate() {
  var btn = document.getElementById('recalc-btn');
  btn.disabled = true; btn.textContent = 'Đang đếm tiền…'; clearAdminMsgs();
  fetch('/api/admin/score', { method: 'POST', headers: { 'x-admin-id': state.adminId } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false; btn.textContent = '🏆 Tính tiền';
      if (data.success) showAdminMsg('success', 'Đã tính tiền!');
      else showAdminMsg('error', data.error || 'Tính tiền lỗi, liên hệ Tuấn mập');
    })
    .catch(function () { btn.disabled = false; btn.textContent = '🏆 Tính tiền'; showAdminMsg('error', 'Failed.'); });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function show(id) { var el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }
function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
function showError(msg) { var el = document.getElementById('error-box'); el.textContent = msg; show('error-box'); }
function showFieldError(id, msg) { var el = document.getElementById(id); el.textContent = msg; show(id); }
function showAdminMsg(type, msg) {
  if (type === 'error') { var e = document.getElementById('admin-error'); e.textContent = msg; show('admin-error'); }
  else { var s = document.getElementById('admin-success'); s.textContent = msg; show('admin-success'); }
}
function clearAdminMsgs() { hide('admin-error'); hide('admin-success'); }
function escHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(str) { return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
