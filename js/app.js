/* ─── QA Daily Update — app.js ─────────────────────────── */

const STORAGE_KEY_PAT     = 'qa_jira_pat';
const STORAGE_KEY_URL     = 'qa_jira_url';
const STORAGE_KEY_JQL_R   = 'qa_jql_reopen';
const STORAGE_KEY_JQL_P   = 'qa_jql_pushed';
const STORAGE_KEY_HISTORY = 'qa_history';

const DEFAULT_URL   = 'https://jdac.unilogcorp.com';
const DEFAULT_JQL_R = `(status CHANGED FROM "QA STAGE" TO ("DEV STAGE","DEV QUEUE","BACKLOG") BY currentUser() AFTER startOfDay() OR status CHANGED FROM "QA PRODUCTION" TO ("DEV PRODUCTION","DEV STAGE") BY currentUser() AFTER startOfDay()) ORDER BY updated DESC`;
const DEFAULT_JQL_P = `(status CHANGED FROM "QA STAGE" TO "APPROVAL STAGE" BY currentUser() AFTER startOfDay() OR status CHANGED FROM "QA PRODUCTION" TO "APPROVAL PRODUCTION" BY currentUser() AFTER startOfDay()) ORDER BY updated DESC`;

/* ─── State ─────────────────────────────────────────────── */
let state = {
  pat:      localStorage.getItem(STORAGE_KEY_PAT)   || '',
  jiraUrl:  localStorage.getItem(STORAGE_KEY_URL)   || DEFAULT_URL,
  jqlR:     localStorage.getItem(STORAGE_KEY_JQL_R) || DEFAULT_JQL_R,
  jqlP:     localStorage.getItem(STORAGE_KEY_JQL_P) || DEFAULT_JQL_P,
  user:     null,
  pushed:   [],
  reopened: [],
};

/* ─── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setPageDate();
  loadSettingsInputs();
  setupNav();

  if (state.pat) {
    verifyStoredPAT();
  } else {
    setConnectionUI(false);
  }
});

function setPageDate() {
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  const iso   = `${yyyy}-${mm}-${dd}`;

  const input = document.getElementById('fetch-date');
  if (input) {
    input.value = iso;
    input.max   = iso; // can't pick future dates
  }
  updatePageDateLabel(today, true);
}

function updatePageDateLabel(date, isToday) {
  const dateEl  = document.getElementById('page-date');
  const titleEl = document.getElementById('page-title');
  const badge   = document.getElementById('due-badge');
  if (dateEl)  dateEl.textContent = date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (titleEl) titleEl.textContent = isToday ? "Today's QA update" : "QA update";
  if (badge) {
    badge.textContent  = isToday ? 'Due at 6:00 PM' : 'Past date';
    badge.className    = isToday ? 'due-badge' : 'date-past-badge';
  }
  const todayBtn = document.getElementById('today-btn');
  if (todayBtn) todayBtn.style.display = isToday ? 'none' : '';
}

function onDateChange() {
  const input     = document.getElementById('fetch-date');
  const selected  = new Date(input.value + 'T00:00:00');
  const today     = new Date(); today.setHours(0,0,0,0);
  const isToday   = selected.getTime() === today.getTime();
  updatePageDateLabel(selected, isToday);
  // Clear existing data when date changes
  clearFormFields();
}

function resetToToday() {
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  document.getElementById('fetch-date').value = `${yyyy}-${mm}-${dd}`;
  updatePageDateLabel(today, true);
  clearFormFields();
}

function clearFormFields() {
  ['f-pushed','f-reopen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="field-empty">Click fetch to load data…</span>';
  });
  ['f-pushed-cnt','f-reopen-cnt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  ['m-pushed','m-reopen','m-total'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  const keyEl = document.getElementById('f-key');
  if (keyEl) keyEl.value = '';
}

function getSelectedDate() {
  const input = document.getElementById('fetch-date');
  return input ? input.value : null; // yyyy-mm-dd
}

function buildJQL(template, dateStr) {
  if (!dateStr) return template;
  const today    = new Date().toISOString().split('T')[0];
  const username = state.user ? (state.user.name || state.user.key) : null;

  // Always replace currentUser() with actual username for reliable results
  let jql = username
    ? template.replace(/currentUser\(\)/g, `"${username}"`)
    : template;

  // For today: keep startOfDay()
  if (dateStr === today) return jql;

  // For past dates: use ON "YYYY-MM-DD" — Jira matches the exact
  // calendar day in the user's configured timezone (Asia/Kolkata for you)
  return jql.replace(/AFTER startOfDay\(\)/g, `ON "${dateStr}"`);
}

function loadSettingsInputs() {
  document.getElementById('s-jira-url').value  = state.jiraUrl;
  document.getElementById('s-jql-reopen').value = state.jqlR;
  document.getElementById('s-jql-pushed').value = state.jqlP;
  if (state.pat) document.getElementById('s-pat').placeholder = '••••••••••••••••••••••••••• (saved)';
  const proxyEl = document.getElementById('s-proxy-url');
  if (proxyEl) proxyEl.value = localStorage.getItem('qa_proxy_url') || '';
}

/* ─── Navigation ────────────────────────────────────────── */
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const sec = item.dataset.section;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('section-' + sec).classList.add('active');
    });
  });
}

function goSettings() {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelector('[data-section="settings"]').classList.add('active');
  document.getElementById('section-settings').classList.add('active');
}

/* ─── PAT / Auth ────────────────────────────────────────── */
async function verifyStoredPAT() {
  try {
    const user = await jiraGet('/rest/api/2/myself');
    state.user = user;
    setConnectionUI(true, user);
  } catch {
    setConnectionUI(false);
  }
}

async function connectPAT() {
  const pat      = document.getElementById('s-pat').value.trim();
  const url      = document.getElementById('s-jira-url').value.trim().replace(/\/$/, '');
  const proxyEl  = document.getElementById('s-proxy-url');
  const proxyUrl = proxyEl ? proxyEl.value.trim().replace(/\/$/, '') : '';
  if (!pat) { setConnResult('Please paste your PAT token first.', 'err'); return; }

  // Save proxy URL immediately so jiraGet can use it
  if (proxyUrl) localStorage.setItem('qa_proxy_url', proxyUrl);

  setConnResult('<span class="spinner dark"></span> Verifying token…', '');
  try {
    // Build verify URL — use proxy if set
    const verifyBase = proxyUrl ? proxyUrl + '/jira' : url;
    const r = await fetch(`${verifyBase}/rest/api/2/myself`, {
      headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' }
    });
    if (r.status === 401 || r.status === 403) throw new Error('Invalid or expired token. Please generate a new one from Jira.');
    if (!r.ok) throw new Error(`Jira returned error ${r.status}. Check the URL.`);
    const user = await r.json();

    state.pat     = pat;
    state.jiraUrl = url;
    state.user    = user;
    localStorage.setItem(STORAGE_KEY_PAT, pat);
    localStorage.setItem(STORAGE_KEY_URL, url);

    document.getElementById('s-pat').value = '';
    document.getElementById('s-pat').placeholder = '••••••••••••••••••••••••••• (saved)';
    setConnResult('', '');
    setConnectionUI(true, user);
    showToast('Connected to Jira as ' + (user.displayName || user.name));

  } catch(e) {
    setConnResult(e.message, 'err');
  }
}

function disconnectPAT() {
  state.pat  = '';
  state.user = null;
  localStorage.removeItem(STORAGE_KEY_PAT);
  document.getElementById('s-pat').value = '';
  document.getElementById('s-pat').placeholder = 'Paste your Jira PAT token here…';
  setConnectionUI(false);
  showToast('Disconnected from Jira');
}

function setConnectionUI(connected, user) {
  const dot      = document.getElementById('tok-status-dot') || document.querySelector('.conn-dot');
  const sideBar  = document.getElementById('sidebar-conn');
  const sideText = document.getElementById('sidebar-conn-text');
  const fetchBtn = document.getElementById('fetch-btn');
  const connBarInner = document.getElementById('conn-bar-inner');
  const connBarText  = document.getElementById('conn-bar-text');
  const userRow      = document.getElementById('connected-user-row');

  if (connected && user) {
    // Sidebar
    sideText.textContent = user.displayName || user.name;
    sideBar.querySelector('.conn-dot').className = 'conn-dot connected';

    // Conn bar on main page
    connBarInner.className = 'conn-bar-inner connected';
    connBarText.innerHTML  = `<strong>Connected</strong> as ${user.displayName || user.name} &nbsp;·&nbsp; ${state.jiraUrl}`;

    // Fetch button
    fetchBtn.disabled = false;

    // Settings user card
    const initials = (user.displayName || user.name || 'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('conn-avatar').textContent      = initials;
    document.getElementById('conn-name').textContent        = user.displayName || user.name;
    document.getElementById('conn-email').textContent       = user.emailAddress || '';
    userRow.style.display = 'block';

  } else {
    sideText.textContent = 'Not connected';
    sideBar.querySelector('.conn-dot').className = 'conn-dot disconnected';
    connBarInner.className = 'conn-bar-inner disconnected';
    connBarText.innerHTML  = 'Not connected to Jira — go to <strong>Settings</strong> to add your PAT token';
    fetchBtn.disabled = true;
    userRow.style.display = 'none';
  }
}

function setConnResult(msg, type) {
  const el = document.getElementById('conn-result');
  el.className = 'conn-result' + (type ? ' ' + type : '');
  el.innerHTML = msg;
}

/* ─── Settings Save ─────────────────────────────────────── */
function saveSettings() {
  const url  = document.getElementById('s-jira-url').value.trim().replace(/\/$/, '');
  const jqlR = document.getElementById('s-jql-reopen').value.trim();
  const jqlP = document.getElementById('s-jql-pushed').value.trim();

  state.jiraUrl = url;
  state.jqlR    = jqlR;
  state.jqlP    = jqlP;

  localStorage.setItem(STORAGE_KEY_URL,   url);
  localStorage.setItem(STORAGE_KEY_JQL_R, jqlR);
  localStorage.setItem(STORAGE_KEY_JQL_P, jqlP);

  showToast('Settings saved!');
}

/* ─── Jira API ──────────────────────────────────────────── */

// PROXY_URL: your Cloudflare Worker URL
// Set this after deploying the worker (see README)
// e.g. 'https://qa-jira-proxy.YOUR_NAME.workers.dev'
async function jiraGet(path) {
  // Always read proxy URL fresh from localStorage
  const proxyUrl = localStorage.getItem('qa_proxy_url') || '';
  const baseUrl  = proxyUrl ? proxyUrl + '/jira' : state.jiraUrl;

  const r = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Authorization': `Bearer ${state.pat}`,
      'Content-Type': 'application/json'
    }
  });
  if (r.status === 401 || r.status === 403) {
    throw new Error('TOKEN_EXPIRED');
  }
  if (!r.ok) throw new Error(`Jira API error ${r.status}`);
  return r.json();
}

async function jqlSearch(jql) {
  const url  = `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status&maxResults=50`;
  const data = await jiraGet(url);
  if (data.errorMessages && data.errorMessages.length) throw new Error(data.errorMessages[0]);
  return (data.issues || []).map(i => ({ key: i.key, summary: i.fields.summary }));
}

/* ─── Fetch All ─────────────────────────────────────────── */
async function fetchAll() {
  if (!state.pat) return;

  const btn      = document.getElementById('fetch-btn');
  const dateStr  = getSelectedDate();
  btn.disabled   = true;
  btn.innerHTML  = '<span class="spinner"></span> Fetching…';

  try {
    const jqlR = buildJQL(state.jqlR, dateStr);
    const jqlP = buildJQL(state.jqlP, dateStr);
    const [reopened, pushed] = await Promise.all([
      jqlSearch(jqlR),
      jqlSearch(jqlP)
    ]);

    state.reopened = reopened;
    state.pushed   = pushed;

    updateMetrics(pushed.length, reopened.length);
    renderIssueList('f-pushed', pushed, 'success');
    renderIssueList('f-reopen', reopened, 'danger');
    document.getElementById('f-pushed-cnt').textContent = pushed.length;
    document.getElementById('f-reopen-cnt').textContent = reopened.length;
    autoKeyUpdates(pushed.length, reopened.length);
    saveHistory(pushed, reopened);

    const msg = (!pushed.length && !reopened.length)
      ? 'No status changes yet today — fill in your plans and copy the fields'
      : `${pushed.length} pushed + ${reopened.length} reopened — all fields ready to copy`;
    showToast(msg);

  } catch(e) {
    if (e.message === 'TOKEN_EXPIRED') {
      showToast('Token expired — please reconnect in Settings', 'error');
      setConnectionUI(false);
      disconnectPAT();
    } else {
      showToast('Error: ' + e.message, 'error');
    }
  }

  btn.disabled = false;
  btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
    Re-fetch from Jira`;
}

/* ─── Render ────────────────────────────────────────────── */
function updateMetrics(pushed, reopened) {
  document.getElementById('m-pushed').textContent  = pushed;
  document.getElementById('m-reopen').textContent  = reopened;
  document.getElementById('m-total').textContent   = pushed + reopened;
  document.getElementById('m-pushed-sub').textContent  = pushed  === 1 ? 'issue today' : 'issues today';
  document.getElementById('m-reopen-sub').textContent  = reopened === 1 ? 'issue today' : 'issues today';
}

function renderIssueList(elId, issues, keyClass) {
  const el = document.getElementById(elId);
  if (!issues.length) {
    el.innerHTML = '<span class="field-empty">None today</span>';
    return;
  }
  const jiraBase = state.jiraUrl || 'https://jdac.unilogcorp.com';
  const items = issues.map(i => {
    const url = `${jiraBase}/browse/${i.key}`;
    return `
    <li>
      <a class="issue-key ${keyClass}" href="${url}" target="_blank" title="Open in Jira">${i.key}</a>
      <span class="issue-summary">${escHtml(i.summary)}</span>
      <a class="issue-link-icon" href="${url}" target="_blank" title="Open ${i.key} in Jira">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </li>`;
  }).join('');
  el.innerHTML = `<ul class="issue-list">${items}</ul>`;
}

function autoKeyUpdates(p, r) {
  const el = document.getElementById('f-key');
  if (el.value.trim()) return;
  const dateStr  = getSelectedDate();
  const today    = new Date().toISOString().split('T')[0];
  const isToday  = !dateStr || dateStr === today;
  const label    = isToday ? 'today' : new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  const total    = p + r;
  const lines    = [`Reviewed ${total} issue(s) on ${label}.`];
  if (p) lines.push(`${p} case(s) pushed to customer / approval stage.`);
  if (r) lines.push(`${r} case(s) reopened and sent back to dev.`);
  if (!p && !r) lines.push(`No cases moved on ${label}.`);
  el.value = lines.join('\n');
}

/* ─── Copy ──────────────────────────────────────────────── */
function copyField(id, btn) {
  const val = document.getElementById(id).value;
  doClipboard(val, btn);
}

function copyDiv(id, btn) {
  const el = document.getElementById(id);
  const list = el.querySelectorAll('.issue-list li');
  let text;
  if (list.length) {
    const jiraBase = state.jiraUrl || 'https://jdac.unilogcorp.com';
    text = Array.from(list).map(li => {
      const key = li.querySelector('.issue-key')?.textContent?.trim() || '';
      const sum = li.querySelector('.issue-summary')?.textContent?.trim() || '';
      const url = key ? `${jiraBase}/browse/${key}` : '';
      return url ? `${key}: ${sum}\n${url}` : `${key}: ${sum}`;
    }).join('\n\n');
  } else {
    text = el.innerText.trim();
  }
  doClipboard(text, btn);
}

function doClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Copied!`;
    showToast('Copied to clipboard');
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = orig;
    }, 2000);
  }).catch(() => showToast('Copy failed — try selecting and copying manually', 'error'));
}

/* ─── Support Toggle ────────────────────────────────────── */
function toggleSupport(show) {
  const el = document.getElementById('support-detail');
  el.classList.toggle('hidden', !show);
}

/* ─── History ───────────────────────────────────────────── */
function saveHistory(pushed, reopened) {
  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]');
    const today   = new Date().toISOString().split('T')[0];
    // Replace existing entry for today or prepend
    const idx = history.findIndex(h => h.date === today);
    const entry = { date: today, pushed: pushed.length, reopened: reopened.length, issues: { pushed, reopened } };
    if (idx >= 0) { history[idx] = entry; } else { history.unshift(entry); }
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(0, 30)));
    renderHistory(history);
  } catch { /* ignore */ }
}

function renderHistory(history) {
  const section = document.getElementById('section-history');
  const existing = section.querySelector('.history-list');
  if (existing) existing.remove();

  if (!history || !history.length) return;

  const ul = document.createElement('div');
  ul.className = 'history-list';
  ul.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  history.forEach(h => {
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:16px;';
    const d = new Date(h.date);
    const label = d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    card.innerHTML = `
      <div style="font-size:13px;font-weight:500;color:#555;min-width:160px;">${label}</div>
      <div style="display:flex;gap:16px;flex:1;">
        <div><div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Pushed</div><div style="font-size:20px;font-weight:600;color:#16a34a;">${h.pushed}</div></div>
        <div><div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Reopened</div><div style="font-size:20px;font-weight:600;color:#dc2626;">${h.reopened}</div></div>
        <div><div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Total</div><div style="font-size:20px;font-weight:600;color:#1a1a1a;">${h.pushed + h.reopened}</div></div>
      </div>`;
    ul.appendChild(card);
  });

  section.querySelector('.empty-state')?.remove();
  section.appendChild(ul);
}

/* ─── Toast ─────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = type === 'error' ? '#dc2626' : '#1a1a1a';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/* ─── Util ──────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
