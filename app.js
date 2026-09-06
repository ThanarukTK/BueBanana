/* ============================================================
 * NFC Pay-per-play — Web NFC demo (Chrome on Android)
 *
 * Modes:
 *   - "play":  tap your card to START your timer,
 *              tap the same card again to STOP and get the bill
 *              (฿30/hour, per-minute). Each card = one user.
 *   - "write": tap a card to write a UUID (+ optional label) to it.
 *              While in write mode, check-in/out reading is suspended.
 * ============================================================ */

'use strict';

const STORAGE_KEY = 'nfc_playtime_v1';
const RATE_PER_HOUR = 30; // ฿ per hour

/* ---------- State ----------
 * No boardgames — each card UUID is one user.
 * state = {
 *   users: {
 *     [uuid]: {
 *       label,            // friendly name read from the card (optional)
 *       totalMs,          // total play time across all sessions
 *       totalPaid,        // total cost across all sessions
 *       sessions: [],     // [{ start, end, ms, price }]
 *       activeSince: null // timestamp of the current session, null when idle
 *     }
 *   }
 * }
 */
let state = loadState();
let mode = 'play';       // 'play' | 'write'
let writeUuid = null;    // UUID ready to be written to the next card
let reader = null;       // the single NDEFReader used for play-mode scanning
let scanArmed = false;   // whether handlers are attached (reader is "on")
let scanStarted = false; // whether reader.scan() has been called at least once

/* ---------- DOM refs ---------- */
const $ = (id) => document.getElementById(id);

const elNfcBadge     = $('nfc-badge');
const elModeBadge    = $('mode-badge');
const elWritePanel   = $('write-panel');
const elBillBanner   = $('bill-banner');
const elBillText     = $('bill-text');
const elNowPlaying   = $('now-playing');
const elPlayingCount = $('playing-count');
const elTapHint      = $('tap-hint');
const elUsersList     = $('users-list');
const elLog           = $('log');
const elWriteHint     = $('write-hint');
const elWriteSuccess  = $('write-success');
const elWsUuid        = $('ws-uuid');
const elWsLabel       = $('ws-label');

/* ---------- Storage ---------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.users) return parsed;
    }
  } catch (e) { /* fall through */ }
  return { users: {} };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetDemo() {
  state = { users: {} };
  elBillBanner.classList.add('hidden');
  hideWriteSuccess();
  saveState();
  renderAll();
  log('↺ Demo data reset', '');
}

/* ---------- Pricing & formatting ---------- */
function calcPrice(ms) {
  const baht = (ms / 3_600_000) * RATE_PER_HOUR; // ฿ per hour
  return Math.round(baht * 100) / 100;           // to the nearest satang
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatHuman(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatBaht(v) {
  return '฿' + v.toFixed(2);
}

/* ---------- NFC capability ---------- */
const nfcSupported = 'NDEFReader' in window;

function updateNfcBadge() {
  if (nfcSupported) {
    elNfcBadge.textContent = '📡 NFC ready';
    elNfcBadge.className = 'badge badge-ok';
  } else {
    elNfcBadge.textContent = '⚠️ Web NFC unavailable';
    elNfcBadge.className = 'badge badge-error';
  }
}

/* ---------- Activity log ---------- */
function log(msg, cls = '') {
  const li = document.createElement('li');
  if (cls) li.className = cls;
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.appendChild(time);
  li.appendChild(document.createTextNode(msg));
  elLog.prepend(li);
  // keep the list from growing forever
  while (elLog.children.length > 40) elLog.removeChild(elLog.lastChild);
}

/* ---------- Users ---------- */
function ensureUser(uuid, label) {
  if (!state.users[uuid]) {
    state.users[uuid] = { label: label || null, totalMs: 0, totalPaid: 0, sessions: [], activeSince: null };
  } else if (label) {
    state.users[uuid].label = label;
  }
  return state.users[uuid];
}

function userLabel(uuid) {
  const u = state.users[uuid];
  return (u && u.label) || 'Card ' + shortUuid(uuid);
}

/* ---------- Rendering ---------- */
function renderAll() {
  renderNowPlaying();
  renderUsers();
}

function renderNowPlaying() {
  elNowPlaying.innerHTML = '';
  const active = Object.entries(state.users).filter(([, u]) => u.activeSince);
  elPlayingCount.textContent = active.length ? `${active.length} playing` : '';

  if (active.length === 0) {
    elNowPlaying.innerHTML = '<p class="hint">Nobody is playing right now — tap a card to start.</p>';
    return;
  }

  for (const [uuid, u] of active) {
    const row = document.createElement('div');
    row.className = 'now-row';
    row.innerHTML = `
      <span class="user-avatar">⏱️</span>
      <span class="now-name">${escapeHtml(userLabel(uuid))}</span>
      <span class="timer" data-timer="${uuid}">${formatDuration(Date.now() - u.activeSince)}</span>
      <button class="btn btn-ghost btn-stop" data-stop="${uuid}">⏹ Stop</button>`;
    elNowPlaying.appendChild(row);
  }

  // convenience: stop a session without needing the card
  elNowPlaying.querySelectorAll('.btn-stop').forEach((btn) => {
    btn.addEventListener('click', () => stopSession(btn.dataset.stop));
  });
}

function renderUsers() {
  elUsersList.innerHTML = '';
  const rows = Object.entries(state.users)
    .filter(([, u]) => u.totalMs > 0 || u.sessions.length > 0)
    .sort((a, b) => b[1].totalPaid - a[1].totalPaid);

  if (rows.length === 0) {
    elUsersList.innerHTML = '<p class="hint">No sessions yet — tap your card to start playing.</p>';
    return;
  }

  for (const [uuid, u] of rows) {
    const wrapper = document.createElement('div');
    wrapper.className = 'user-block';
    wrapper.innerHTML = `
      <div class="user-row">
        <div class="user-main">
          <span class="user-avatar">👤</span>
          <div>
            <div class="user-name">${escapeHtml(userLabel(uuid))}</div>
            <div class="user-meta">${u.sessions.length} session(s) · ${formatHuman(u.totalMs)}${u.activeSince ? ' · ▶ playing now' : ''}</div>
          </div>
        </div>
        <div class="user-paid">${formatBaht(u.totalPaid)}</div>
      </div>
      <div class="user-history hidden">
        ${u.sessions.length === 0
          ? '<p class="hint">No completed sessions yet.</p>'
          : u.sessions.slice().reverse().map((s) => `
            <div class="session-row">
              <span>${new Date(s.start).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span>${formatHuman(s.ms)}</span>
              <span class="session-price">${formatBaht(s.price)}</span>
            </div>`).join('')}
      </div>`;

    wrapper.querySelector('.user-row').addEventListener('click', () => {
      wrapper.querySelector('.user-history').classList.toggle('hidden');
    });
    elUsersList.appendChild(wrapper);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------- Mode switching ---------- */
function setMode(next) {
  if (next === mode) return;
  const leavingWrite = mode === 'write';
  mode = next;
  elModeBadge.textContent = mode === 'write' ? '💾 Register Cards' : '🎮 Play · ฿30/h';
  elWritePanel.classList.toggle('hidden', mode !== 'write');
  elTapHint.textContent = mode === 'write'
    ? '🖊️ Tap a card to write its UUID. Repeat for every card you want to register.'
    : '👆 Tap “📲 Tap card”, then tap your card to start your timer. Tap again to stop and pay.';

  if (mode === 'write') {
    // Suspend the check-in/out reader while registering cards
    disarmReader();
    hideWriteSuccess();
    log('⏸️ Read paused — registering cards', '');
    prepareWrite();
  } else if (leavingWrite) {
    // Resume check-in/out scanning (called from a button click = user gesture)
    armReader();
  }
}

$('btn-play-mode').addEventListener('click', () => setMode('play'));
$('btn-write-mode').addEventListener('click', () => setMode('write'));
$('btn-scan').addEventListener('click', armReader);
$('btn-reset').addEventListener('click', resetDemo);

/* ---------- Reading (play mode) ---------- */
async function armReader() {
  if (mode !== 'play') { setMode('play'); return; }
  if (!nfcSupported) {
    log('❌ Web NFC is not supported in this browser. Use Chrome on Android over HTTPS.', 'err');
    return;
  }
  if (scanArmed) {
    log('📡 Reader already active — tap your card.', '');
    return;
  }

  try {
    if (!reader) reader = new NDEFReader();
    if (!scanStarted) {
      await reader.scan();
      scanStarted = true;
    }
    // (re)attach handlers — safe to call even if the scan is already running
    reader.onreading = ({ message }) => {
      if (mode !== 'play') return; // never act on reads while write mode is active
      const { uuid, label } = extractData(message);
      if (!uuid) {
        log('⚠️ Card has no registered UUID — use “Register Cards” first.', 'err');
        return;
      }
      processCard(uuid, label);
    };
    reader.onreadingerror = () => {
      if (mode !== 'play') return;
      log('❌ Could not read the card — try again (hold it steady).', 'err');
    };
    scanArmed = true;
    log('📡 Reader active — tap your card…', '');
  } catch (err) {
    scanArmed = false;
    handleNfcError(err, 'read');
  }
}

function disarmReader() {
  scanArmed = false;
  if (reader) {
    // detach handlers so card taps no longer trigger check-in/out
    reader.onreading = null;
    reader.onreadingerror = null;
  }
}

function extractData(message) {
  let uuid = null;
  let label = null;
  for (const record of message.records) {
    if (record.recordType !== 'text') continue;
    const data = new TextDecoder().decode(record.data).trim();
    const m = data.match(/^BTG\|(.+)$/);
    if (m) { uuid = m[1]; continue; }
    const l = data.match(/^LABEL\|(.+)$/);
    if (l) { label = l[1]; continue; }
  }
  // fallback: treat any text record that looks like a UUID as one
  if (!uuid) {
    for (const record of message.records) {
      if (record.recordType !== 'text') continue;
      const data = new TextDecoder().decode(record.data).trim();
      if (/^[0-9A-Fa-f-]{8,}$/.test(data)) { uuid = data; break; }
    }
  }
  return { uuid, label };
}

/* ---------- Start / stop ---------- */
function processCard(uuid, label) {
  const user = ensureUser(uuid, label);
  if (user.activeSince) {
    stopSession(uuid);
  } else {
    user.activeSince = Date.now();
    saveState();
    renderAll();
    log(`▶️ ${userLabel(uuid)} started playing`, 'ok');
  }
}

function stopSession(uuid) {
  const user = state.users[uuid];
  if (!user || !user.activeSince) return;

  const start = user.activeSince;
  const end = Date.now();
  const ms = Math.max(0, end - start);
  const price = calcPrice(ms);

  user.sessions.push({ start, end, ms, price });
  user.totalMs += ms;
  user.totalPaid += price;
  user.activeSince = null;

  saveState();
  renderAll();
  showBill(userLabel(uuid), ms, price);
  log(`⏹️ ${userLabel(uuid)} stopped · ${formatHuman(ms)} · ${formatBaht(price)}`, 'ok');
}

function showBill(label, ms, price) {
  elBillText.innerHTML =
    `<strong>${escapeHtml(label)}</strong><br>
     Played ${formatDuration(ms)} (${formatHuman(ms)}) at ฿${RATE_PER_HOUR}/hour<br>
     <span class="price">Total: ${formatBaht(price)}</span>`;
  elBillBanner.classList.remove('hidden');
}

/* ---------- Write mode ---------- */
function prepareWrite() {
  const label = $('card-label').value.trim();
  const custom = $('card-uuid').value.trim();
  writeUuid = custom || crypto.randomUUID().toUpperCase();
  $('write-hint').textContent = `Ready to write UUID: ${shortUuid(writeUuid)} — tap the card now.`;
}

$('card-label').addEventListener('input', prepareWrite);
$('card-uuid').addEventListener('input', prepareWrite);

async function writeCard() {
  if (!nfcSupported) {
    log('❌ Web NFC is not supported in this browser. Use Chrome on Android over HTTPS.', 'err');
    return;
  }
  prepareWrite();
  const label = $('card-label').value.trim();

  try {
    const writer = new NDEFReader();
    await writer.write({
      records: [
        { recordType: 'text', data: `BTG|${writeUuid}` },
        ...(label ? [{ recordType: 'text', data: `LABEL|${label}` }] : []),
      ],
    });
    showWriteSuccess(writeUuid, label);
    log(`💾 Wrote UUID ${shortUuid(writeUuid)}${label ? ` (${label})` : ''} to card`, 'ok');
    prepareWrite(); // get a fresh UUID, ready for the next card
  } catch (err) {
    hideWriteSuccess();
    handleNfcError(err, 'write');
  }
}

/* ---------- Write success UI ---------- */
function showWriteSuccess(uuid, label) {
  elWsUuid.textContent = shortUuid(uuid);
  elWsLabel.textContent = label ? ` · ${label}` : '';
  elWriteSuccess.classList.remove('hidden');
}

function hideWriteSuccess() {
  elWriteSuccess.classList.add('hidden');
}

$('btn-write').addEventListener('click', writeCard);

/* ---------- Shared helpers ---------- */
function shortUuid(uuid) {
  if (!uuid) return '—';
  return uuid.length > 12 ? uuid.slice(0, 8) + '…' + uuid.slice(-4) : uuid;
}

function handleNfcError(err, action) {
  switch (err.name) {
    case 'NotAllowedError':
      log('❌ NFC permission denied. Tap the card again to allow access.', 'err');
      break;
    case 'NotSupportedError':
      log('❌ This tag is not NDEF-formattable (e.g. it may already be formatted differently).', 'err');
      break;
    case 'NotReadableError':
      log('❌ Could not ' + action + ' the card — remove it and try again.', 'err');
      break;
    case 'AbortError':
      log('⚠️ Read cancelled — tap the card again.', '');
      break;
    default:
      log(`❌ ${action === 'write' ? 'Write' : 'Read'} failed: ${err.message || err}`, 'err');
  }
}

/* ---------- Boot ---------- */
updateNfcBadge();
renderAll();
setMode('play');

// keep live timers ticking every second
setInterval(() => {
  for (const [uuid, u] of Object.entries(state.users)) {
    if (u.activeSince) {
      const el = elNowPlaying.querySelector(`[data-timer="${uuid}"]`);
      if (el) el.textContent = formatDuration(Date.now() - u.activeSince);
    }
  }
}, 1000);

if (!nfcSupported) {
  log('⚠️ Running without Web NFC support — the UI works, but card tap only works in Chrome on Android over HTTPS.', '');
}
