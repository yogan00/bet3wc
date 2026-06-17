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
  submitCutoffMinutes: 180,
  matchLookaheadHours: 36,
  foundUser: null,
  picks: {},
  existingPicks: {},
  submitted: false,
  adminId: null,
  adminMatches: [],
  adminAllDays: [],
  adminSelectedDay: null,
  adminCalendarOpen: false,
  adminCalYear: new Date().getFullYear(),
  adminCalMonth: new Date().getMonth() + 1,
};

var MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// ── Match identity ─────────────────────────────────────────────────────────
// Two or more matches can share the exact same dateTime (simultaneous
// kickoffs). `occurrence` (0, 1, 2…) tells them apart — it's assigned by the
// API in column order, the same way for every match with that dateTime.
// Anywhere we need a unique key for a match (to store/look up a pick), use
// buildMatchKey/matchKey instead of match.dateTime alone.
function buildMatchKey(dateTime, occurrence) {
  return dateTime + '__' + (occurrence || 0);
}
function matchKey(match) {
  return buildMatchKey(match.dateTime, match.occurrence);
}

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  fetchDaysAndConfig();

  document.getElementById('user-query').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleLookup();
  });
  document.getElementById('admin-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleAdminLogin();
  });

  // Close calendar(s) on outside click
  document.addEventListener('mousedown', function (e) {
    if (state.calendarOpen) {
      var popup = document.getElementById('calendar-popup');
      var btn = document.getElementById('date-trigger-btn');
      if (popup && !popup.contains(e.target) && btn && !btn.contains(e.target)) {
        closeCalendar();
      }
    }
    if (state.adminCalendarOpen) {
      var adminPopup = document.getElementById('admin-calendar-popup');
      var adminBtn = document.getElementById('admin-date-trigger-btn');
      if (adminPopup && !adminPopup.contains(e.target) && adminBtn && !adminBtn.contains(e.target)) {
        closeAdminCalendar();
      }
    }
  });
});

function updateCutoffDesc() {
  var mins = state.submitCutoffMinutes;
  var desc;
  if (mins <= 0) {
    desc = mins === 0 ? 'Mọi kèo đều đóng đúng giờ đá.' : 'Mọi kèo đều đóng ' + Math.abs(mins) + ' phút sau khi trận bắt đầu.';
  } else if (mins % 60 === 0) {
    desc = 'Mọi kèo đều đóng trước giờ đá là ' + (mins / 60) + ' tiếng.';
  } else {
    desc = 'Mọi kèo đều đóng trước giờ đá là ' + mins + ' phút.';
  }
  document.getElementById('cutoff-desc').textContent = desc;
}

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
    }

    if (configData.sheetUrl) {
      state.sheetUrl = configData.sheetUrl;
      document.getElementById('sheet-link').href = configData.sheetUrl;
      show('sheet-link-wrap');
    }

    if (typeof configData.submitCutoffMinutes === 'number') {
      state.submitCutoffMinutes = configData.submitCutoffMinutes;
    }
    if (typeof configData.matchLookaheadHours === 'number') {
      state.matchLookaheadHours = configData.matchLookaheadHours;
    }
    updateCutoffDesc();

    updateDateTrigger();
    fetchMatches();
    setInterval(fetchMatches, 60000);
  }).catch(function () {
    fetchMatches();
    setInterval(fetchMatches, 60000);
  });
}

// ── Date trigger (user view) ───────────────────────────────────────────────────
function updateDateTrigger() {
  show('date-trigger-wrap');
  if (state.selectedDay) {
    setText('date-trigger-label', formatDayLabel(state.selectedDay));
  } else {
    setText('date-trigger-label', 'Sắp diễn ra');
  }
}

function toggleCalendar() {
  if (state.calendarOpen) { closeCalendar(); } else { openCalendar(); }
}

function openCalendar() {
  var refDay = state.selectedDay || state.nearestDay;
  if (refDay) {
    var parts = refDay.split('-');
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
  var activeDay = state.selectedDay;

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

function resetToDefault() {
  state.selectedDay = null;
  state.submitted = false;
  state.foundUser = null;
  state.picks = {};
  state.existingPicks = {};
  closeCalendar();
  updateDateTrigger();
  fetchMatches();
}

function switchDay(day) {
  state.selectedDay = day;
  state.submitted = false;
  state.foundUser = null;
  state.picks = {};
  state.existingPicks = {};
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

  if (closedMatches.length > 0 && openMatches.length === 0) { updateCutoffDesc(); show('closed-notice'); }
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

function handicapLine(match) {
  var raw = (match.handicap || '').trim().replace(',', '.');
  if (!raw) return '';
  var h = parseFloat(raw);
  if (isNaN(h) || h === 0) return '';
  var team = h > 0 ? match.team1 : match.team2;
  var val = Math.abs(h);
  var valStr = val % 1 === 0 ? String(val) : String(val);
  return '<div class="match-handicap">' + escHtml(team) + ' chấp ' + escHtml(valStr) + '</div>';
}

function renderMatchCards(openMatches) {
  var container = document.getElementById('match-cards');
  container.innerHTML = '';
  openMatches.forEach(function (match) {
    var card = document.createElement('div');
    card.className = 'match-card';
    var key = matchKey(match);
    var existing = state.foundUser ? (state.existingPicks[key] || '') : '';
    var badgeHtml = existing
      ? '<div class="existing-pick-badge">đã chọn: <strong>' + escHtml(existing) + '</strong></div>'
      : '';
    card.innerHTML =
      '<div class="match-card-header">' +
        '<div class="match-time">' + escHtml(match.dateTime) + '</div>' +
        badgeHtml +
      '</div>' +
      handicapLine(match) +
      '<div class="team-grid">' +
        renderTeamBtn(match, match.team1) +
        renderTeamBtn(match, match.team2) +
      '</div>' +
      (!state.foundUser ? '<p class="pick-hint">Điền thông tin trước khi chọn đội</p>' : '');
    container.appendChild(card);
  });
}

function renderTeamBtn(match, team) {
  var key = matchKey(match);
  var selected = state.picks[key] === team;
  var existingPick = state.existingPicks[key];
  var locked = !!existingPick;
  var disabled = (!state.foundUser || locked) ? 'disabled' : '';
  var selClass = selected ? ' selected' : '';
  var lockedClass = locked ? ' locked' : '';
  return '<button class="team-btn' + selClass + lockedClass + '" ' + disabled +
    ' onclick="handlePickTeam(\'' + escAttr(match.dateTime) + '\', ' + (match.occurrence || 0) + ', \'' + escAttr(team) + '\')">' +
    '<span class="pick-label">✓ PICKED</span>' + escHtml(team) + '</button>';
}

function renderSuccess(openMatches) {
  show('success-box');
  setText('success-name', state.foundUser ? state.foundUser.name : '');
  var picksHtml = openMatches.map(function (m) {
    return '<div class="success-pick">' + escHtml(m.dateTime) + ': <span>' + escHtml(state.picks[matchKey(m)] || '') + '</span></div>';
  }).join('');
  document.getElementById('success-picks').innerHTML = '<div class="success-picks">' + picksHtml + '</div>';
}

function updateSubmitBtn(openMatches) {
  var count = openMatches.filter(function (m) {
    return !!state.picks[matchKey(m)];
  }).length;
  var anyPicked = count > 0;
  var btn = document.getElementById('submit-btn');
  btn.disabled = !anyPicked;
  btn.textContent = 'Chốt đơn' + (openMatches.length > 1 ? ' (' + count + '/' + openMatches.length + ')' : '');
  document.getElementById('pick-hint').style.display = anyPicked ? 'none' : '';
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
        fetch('/api/picks?userId=' + encodeURIComponent(data.user.id))
          .then(function (r) { return r.json(); })
          .then(function (pd) {
            // pd.picks is an array of { dateTime, occurrence, team } —
            // build a lookup keyed the same way as state.picks/existingPicks.
            var picksArr = pd.picks || [];
            var existing = {};
            picksArr.forEach(function (p) {
              existing[buildMatchKey(p.dateTime, p.occurrence)] = p.team;
            });
            state.existingPicks = existing;
            Object.keys(state.existingPicks).forEach(function (k) {
              if (!(k in state.picks)) state.picks[k] = state.existingPicks[k];
            });
            var openMatches = state.matches.filter(function (m) { return !m.closed; });
            renderMatchCards(openMatches);
            show('submit-area');
            updateSubmitBtn(openMatches);
          })
          .catch(function () {
            state.existingPicks = {};
            var openMatches = state.matches.filter(function (m) { return !m.closed; });
            renderMatchCards(openMatches);
            show('submit-area');
            updateSubmitBtn(openMatches);
          });
      } else {
        showFieldError('lookup-error', 'Không có tên, vui lòng thử lại');
      }
    })
    .catch(function () {
      btn.disabled = false; btn.textContent = 'Kiểm tra';
      showFieldError('lookup-error', 'Không có tên, vui lòng thử lại');
    });
}

function handlePickTeam(matchDateTime, occurrence, team) {
  if (!state.foundUser) return;
  state.picks[buildMatchKey(matchDateTime, occurrence)] = team;
  var openMatches = state.matches.filter(function (m) { return !m.closed; });
  renderMatchCards(openMatches);
  updateSubmitBtn(openMatches);
}

function handleSubmit() {
  if (!state.foundUser) return;
  var btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = 'Đang chốt đơn…';
  hide('submit-error');

  var openMatches = state.matches.filter(function (m) { return !m.closed; });
  // picksToSubmit is now a list of { dateTime, occurrence, team } so the
  // server can tell apart matches that share the same dateTime.
  var picksToSubmit = [];
  openMatches.forEach(function (m) {
    var pick = state.picks[matchKey(m)];
    if (pick) picksToSubmit.push({ dateTime: m.dateTime, occurrence: m.occurrence || 0, team: pick });
  });

  fetch('/api/picks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: state.foundUser.id, picks: picksToSubmit }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.textContent = 'Chốt đơn';
      if (data.success) { state.submitted = true; renderMatches(); }
      else { showFieldError('submit-error', data.error || 'Submission failed'); updateSubmitBtn(openMatches); }
    })
    .catch(function () {
      btn.disabled = false; btn.textContent = 'Chốt đơn';
      showFieldError('submit-error', 'Đơn chưa chốt, kèo chưa vô, vui lòng thử lại');
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

function openAdmin() { hide('main-view'); show('admin-view'); show('scroll-end-btn'); show('scroll-top-btn'); loadAdminMatches(); }
function closeAdmin() {
  show('main-view'); hide('admin-view'); hide('scroll-end-btn'); hide('scroll-top-btn');
  closeAdminCalendar();
  state.adminId = null;
  state.adminSelectedDay = null;
  document.getElementById('admin-input').value = '';
}

function loadAdminMatches() {
  show('admin-loading'); hide('admin-content');
  fetch('/api/admin/matches', { headers: { 'x-admin-id': state.adminId } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      hide('admin-loading');
      if (data.error) { showAdminMsg('error', data.error); return; }
      state.adminMatches = data.matches || [];
      state.adminSelectedDay = null;
      computeAdminAllDays();
      updateAdminDateTrigger();
      renderAdminMatches(); show('admin-content');
    })
    .catch(function () { hide('admin-loading'); showAdminMsg('error', 'Failed to load matches.'); });
}

// ── Admin day filtering ──────────────────────────────────────────────────────
// Admin sees the same "pick a day" UI as the user view, but the default
// ("Sắp diễn ra") window is wider: MATCH_LOOKAHEAD_HOURS *before* now through
// MATCH_LOOKAHEAD_HOURS *after* now (e.g. 36h -> a 72h window), instead of
// the user's "now through +lookahead" window. This makes it easy for admins
// to find recently-played matches (to set winners) as well as upcoming ones,
// without having to scroll through every match ever scheduled.

function computeAdminAllDays() {
  var seen = {};
  state.adminMatches.forEach(function (m) {
    var d = parseAdminDate(m.dateTime);
    if (!d) return;
    seen[adminDateKey(d)] = true;
  });
  state.adminAllDays = Object.keys(seen).sort();
}

function adminDateKey(d) {
  return toKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function isInAdminDefaultWindow(d) {
  var hours = typeof state.matchLookaheadHours === 'number' ? state.matchLookaheadHours : 36;
  var ms = hours * 60 * 60 * 1000;
  var now = Date.now();
  return d.getTime() >= (now - ms) && d.getTime() <= (now + ms);
}

// Returns the visible subset of state.adminMatches, each tagged with its
// original index (origIdx) so edits/removes still map back correctly.
function getVisibleAdminMatches() {
  return state.adminMatches
    .map(function (m, origIdx) { return { match: m, origIdx: origIdx }; })
    .filter(function (entry) {
      var d = parseAdminDate(entry.match.dateTime);
      if (!d) return true; // new/blank rows always visible
      if (state.adminSelectedDay) return adminDateKey(d) === state.adminSelectedDay;
      return isInAdminDefaultWindow(d);
    });
}

function updateAdminDateTrigger() {
  show('admin-date-trigger-wrap');
  if (state.adminSelectedDay) {
    setText('admin-date-trigger-label', formatDayLabel(state.adminSelectedDay));
  } else {
    setText('admin-date-trigger-label', 'Sắp diễn ra');
  }
}

function toggleAdminCalendar() {
  if (state.adminCalendarOpen) { closeAdminCalendar(); } else { openAdminCalendar(); }
}

function openAdminCalendar() {
  var refDay = state.adminSelectedDay || adminDateKey(new Date());
  var parts = refDay.split('-');
  state.adminCalYear = Number(parts[0]);
  state.adminCalMonth = Number(parts[1]);
  state.adminCalendarOpen = true;
  renderAdminCalendar();
  show('admin-calendar-popup');
  setText('admin-date-trigger-arrow', '▲');
}

function closeAdminCalendar() {
  state.adminCalendarOpen = false;
  hide('admin-calendar-popup');
  setText('admin-date-trigger-arrow', '▼');
}

function adminCalPrevMonth() {
  if (state.adminCalMonth === 1) { state.adminCalYear--; state.adminCalMonth = 12; }
  else { state.adminCalMonth--; }
  renderAdminCalendar();
}

function adminCalNextMonth() {
  if (state.adminCalMonth === 12) { state.adminCalYear++; state.adminCalMonth = 1; }
  else { state.adminCalMonth++; }
  renderAdminCalendar();
}

function renderAdminCalendar() {
  var y = state.adminCalYear;
  var m = state.adminCalMonth;
  setText('admin-cal-month-label', MONTH_NAMES[m - 1] + ' ' + y);

  var daysInMonth = new Date(y, m, 0).getDate();
  var startDow = new Date(y, m - 1, 1).getDay();
  var activeDay = state.adminSelectedDay;

  var grid = document.getElementById('admin-cal-grid');
  grid.innerHTML = '';

  for (var blank = 0; blank < startDow; blank++) {
    var emptyCell = document.createElement('div');
    grid.appendChild(emptyCell);
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var key = toKey(y, m, d);
    var hasMatch = state.adminAllDays.indexOf(key) !== -1;
    var isSelected = key === activeDay;

    var cell = document.createElement('button');
    cell.textContent = String(d);
    cell.className = 'cal-day' +
      (isSelected ? ' cal-selected' : hasMatch ? ' cal-has-match' : ' cal-no-match');
    cell.disabled = !hasMatch;

    if (hasMatch) {
      (function (k) {
        cell.onclick = function () { switchAdminDay(k); };
      })(key);
    }

    grid.appendChild(cell);
  }
}

function switchAdminDay(day) {
  state.adminSelectedDay = day;
  closeAdminCalendar();
  updateAdminDateTrigger();
  renderAdminMatches();
}

function resetAdminToDefault() {
  state.adminSelectedDay = null;
  closeAdminCalendar();
  updateAdminDateTrigger();
  renderAdminMatches();
}

var TYPE_OPTIONS = [
  { value: '', label: 'Type (optional)' },
  { value: 'Vòng bảng', label: 'Vòng bảng (+1 pt)' },
  { value: '32', label: 'Vòng 32 (+2 pts)' },
  { value: '16', label: 'Vòng 16 (+3 pts)' },
  { value: 'Tranh cúp', label: 'Tranh cúp (+4 pts)' },
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
  // Try dd/MM/yyyy format first (sheet format) to avoid browser parsing as MM/dd
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (m) {
    var day = +m[1], mon = +m[2], yr = +m[3], hr = +m[4], min = +(m[5] || 0), ampm = (m[6] || '').toLowerCase();
    if (ampm === 'pm' && hr < 12) hr += 12;
    if (ampm === 'am' && hr === 12) hr = 0;
    return new Date(yr, mon - 1, day, hr, min);
  }
  // Fallback for ISO strings
  var d = new Date(s);
  if (!isNaN(d)) return d;
  return null;
}

function isAdminMatchPast(match) {
  var hasWinner = !!(match.winner && match.winner.trim());
  var d = parseAdminDate(match.dateTime);
  var timeOver = d ? new Date() > new Date(d.getTime() + 150 * 60 * 1000) : false;
  return hasWinner && timeOver;
}

function renderAdminMatches() {
  var container = document.getElementById('admin-matches');
  container.innerHTML = '';
  var visible = getVisibleAdminMatches();

  if (visible.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'muted small center-text mt-sm';
    empty.textContent = state.adminSelectedDay
      ? 'Không có lịch đá ngày này.'
      : 'Không có lịch đá trong khoảng thời gian này.';
    container.appendChild(empty);
    return;
  }

  visible.forEach(function (entry, displayIdx) {
    container.appendChild(buildAdminMatchCard(entry.match, entry.origIdx, displayIdx + 1));
  });
}

function buildAdminMatchCard(match, idx, displayNumber) {
  var card = document.createElement('div');
  var past = isAdminMatchPast(match);
  card.className = 'admin-match-card' + (past ? ' admin-match-card--past' : '');
  card.id = 'admin-match-' + idx;
  var hasWinner = match.winner && match.winner.trim();
  var lockedAttr = past ? ' disabled' : '';
  card.innerHTML =
    '<div class="admin-match-header"><span class="admin-match-label">Match ' + displayNumber + (past ? ' <span class="past-badge">PAST</span>' : '') + '</span>' +
    '<button class="remove-btn" onclick="removeMatch(' + idx + ')">Remove</button></div>' +
    '<div class="two-col">' +
    '<input type="text" placeholder="Date &amp; Time (e.g. 12/06/2026 2am)" value="' + escAttr(match.dateTime) + '" oninput="updateMatch(' + idx + ', \'dateTime\', this.value)"' + lockedAttr + ' />' +
    '<input type="text" placeholder="Kèo (e.g. 0.5, -1)" value="' + escAttr(match.handicap || '') + '" oninput="updateMatch(' + idx + ', \'handicap\', this.value)"' + lockedAttr + ' /></div>' +
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
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addMatch() {
  state.adminMatches.push({ dateTime: '', team1: '', team2: '', winner: '', type: '', handicap: '' });
  // A brand-new blank match has no parseable date, so it's always visible
  // regardless of the current day filter — no need to reset the filter.
  renderAdminMatches();
}

function removeMatch(idx) {
  state.adminMatches.splice(idx, 1);
  computeAdminAllDays();
  renderAdminMatches();
}

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
  if (field === 'dateTime') {
    computeAdminAllDays();
  }
}

function handleSave() {
  var btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = 'Đang lưu…'; clearAdminMsgs();
  // Always save the FULL match list (not just the currently visible day),
  // since the day filter is purely a display concern.
  var cleaned = state.adminMatches.filter(function (m) { return m.dateTime.trim() && m.team1.trim() && m.team2.trim(); });
  fetch('/api/admin/matches', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-id': state.adminId },
    body: JSON.stringify({ matches: cleaned }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false; btn.textContent = 'Lưu lịch thi đấu';
      if (data.success) {
        state.adminMatches = cleaned;
        computeAdminAllDays();
        renderAdminMatches();
        showAdminMsg('success', 'Match schedule saved!');
      }
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
