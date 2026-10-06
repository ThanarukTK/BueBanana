/**
 * Demo sync layer for `Demo/group-demo.html` — connects the page to Firestore.
 *
 *   NFCSync.init()                     // connect (Firestore is the only backend)
 *   NFCSync.subscribe(fn)              // fn(state) on every change, from any device
 *   NFCSync.dispatch({ type, ... })    // scan | checkout-one | checkout-all | dismiss | reset
 *
 * WHY THIS FILE EXISTS
 * `docs/structure.md` §4 says the database is reachable only through the ElysiaJS backend, and
 * `docs/api-convention.md` §3 gives the browser no database credentials. This module is therefore
 * DEMO PLUMBING ONLY: it lets the group-flow demo run on two devices at once so the one-shared-
 * reader flow in `docs/api-contract.md` §3.1 can be demonstrated live. A `rest` backend that calls
 * `POST /api/v1/scans`, `POST /api/v1/sessions/:sessionId/check-out` and friends is where this goes
 * in production — the command vocabulary below is deliberately the same as that contract.
 *
 * `rule.md` rules applied here:
 *  - PDPA (minimisation): only a synthetic internal tag id (`tag_A`) and a non-legal display label
 *    leave the device. This module never reads or writes a raw NFC UID.
 *  - PDPA (third-party transfer): Firestore is a third-party processor — the only data it receives
 *    is synthetic demo data, and `Demo/README.md` documents that.
 *  - PDPA (no personal data in logs): audit entries carry an internal tag id plus a device id,
 *    never a name, contact detail, or credential.
 *  - CCA §26: every state-changing action appends an audit entry. The `demoAudit` collection is
 *    NOT the retained compliance log (that one lives server-side, append-only, ≥90 days) — its
 *    rules only allow create/read, so the demo cannot rewrite history either.
 *  - ETA §9: check-out requires explicit confirmation evidence (`customerConfirmed: true` plus the
 *    final amount), never an implicit or default one.
 */

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** ฿30 / hour, in satang (integers only — `docs/api-convention.md` §7). */
export const RATE_PER_HOUR_SATANG = 3000;
/** ฿0.50 a minute: the step the bill actually moves in (see `amountFor`). */
export const RATE_PER_MINUTE_SATANG = RATE_PER_HOUR_SATANG / 60;
/**
 * There is **no minimum charge**, and the bill moves once a minute: ฿30/hour billed per started
 * minute. The backend prices it from its own stored check-in time and the demo only displays/confirms
 * that figure — nothing here invents a price.
 */
export const BILLING_NOTE = '฿30/hour · ฿0.50 per started minute · priced server-side';
/** How long a join window stays open after a tap (`docs/api-contract.md` §3.1). */
export const JOIN_WINDOW_MS = 30000;
/** Reader display timeout — mirrors the same 30s safety net. */
export const SCREEN_TIMEOUT_MS = 30000;
/** `docs/api-contract.md` §2 shapes, stored as document collections. */
export const COLLECTIONS = {
  groups: 'demoGroups',
  sessions: 'demoSessions',
  tags: 'demoTags',
  counters: 'demoCounters',
  audit: 'demoAudit',
  reader: 'readerState',
  readerDoc: 'current',
  counterDoc: 'groups',
};

/** Firebase JS SDK pinned for the CDN modules (ESM build). */
export const FIREBASE_SDK_VERSION = '12.19.0';
/** Emulator-first defaults: `firebase emulators:start --project demo-nfc-cafe`. */
export const EMULATOR = { host: '127.0.0.1', firestore: 8080, auth: 9099, projectId: 'demo-nfc-cafe' };

const CLIENT_ID_KEY = 'nfcDemo.clientId';

/**
 * A stable, non-personal id for this browser. Used as the audit actor so an action can be traced
 * to a device — the real system traces to an authenticated staff account instead (`rule.md` CCA §26).
 */
export const clientId = (() => {
  let id = null;
  try { id = localStorage.getItem(CLIENT_ID_KEY); } catch { /* storage may be unavailable */ }
  if (!id) {
    id = 'device_' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(CLIENT_ID_KEY, id); } catch { /* fine, in-memory only */ }
  }
  return id;
})();

export const DEFAULT_READER = {
  screen: 'idle',
  screenUntilMs: 0,
  openGroupId: null,
  openUntilMs: 0,
  scan: null,
};

// ---------------------------------------------------------------------------------------------
// Money / time helpers (pure — shared by both backends and the UI)
// ---------------------------------------------------------------------------------------------

export const baht = (satang) => '฿' + (Number(satang || 0) / 100).toFixed(2);

/**
 * Same rule the backend applies (`backend/src/domain.ts`): ฿30/hour billed per **started minute**
 * (฿0.50 each), no minimum. Kept identical on purpose — the Firestore path and the REST path must
 * never disagree about a price, and only the backend's figure is ever accepted at check-out.
 */
export function amountFor(fromMs, toMs, members = 1) {
  const minutes = Math.ceil(Math.max(0, toMs - fromMs) / 60000);
  return minutes * RATE_PER_MINUTE_SATANG * members;
}

export function minutesBetween(fromMs, toMs) {
  return Math.max(1, Math.floor((toMs - fromMs) / 60000));
}

export const clock = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const clockSeconds = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Device-level connectivity, which is NOT the same as Firestore reachability: the device can be
 * online while the backend is refusing us (bad rules, project down), and offline while Firestore
 * happily serves its local cache and queues our writes for later.
 */
export function isDeviceOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// ---------------------------------------------------------------------------------------------
// State shape & derivations
// ---------------------------------------------------------------------------------------------

export function emptyState() {
  return {
    groups: {},      // groupId -> Group   (docs/api-contract.md §2)
    sessions: {},    // sessionId -> Session
    tags: {},        // tagId -> { sessionId, groupId } — the "who is checked in" index
    counters: {},    // group numbering
    reader: { ...DEFAULT_READER },
    logs: [],        // activity view: newest first
    sync: { backend: 'rest', status: 'connecting', detail: 'starting…' },
  };
}

/** The open join window, or null — recomputed on read so an expired window never lingers. */
export function openGroupIdOf(state, now = Date.now()) {
  const id = state.reader?.openGroupId;
  if (!id || now >= (state.reader?.openUntilMs || 0)) return null;
  const group = state.groups[id];
  return group && group.status === 'active' ? id : null;
}

/** The screen the reader should be showing, applying the 30s display timeout. */
export function screenOf(state, now = Date.now()) {
  return now < (state.reader?.screenUntilMs || 0) ? state.reader.screen : 'idle';
}

/** The member currently scanning, but only while the roster screen is up. */
export function scanContextOf(state, now = Date.now()) {
  return screenOf(state, now) === 'group' ? state.reader.scan || null : null;
}

/**
 * What the **staff view** should highlight — `PB-14`, "who is scanning", from the `/ws/admin`
 * `scan.activity` event (`docs/api-contract.md` §4.2).
 *
 * This is deliberately separate from `scanContextOf`: the reader's own screen comes from its
 * `POST /api/v1/scans` response, while the staff view is driven by the broadcast event — which is
 * also the only thing a second browser window (staff-only) ever receives.
 */
export function staffScanOf(state, now = Date.now()) {
  const activity = state.activity;
  if (activity && activity.groupId && now - (activity.at || 0) < SCREEN_TIMEOUT_MS) return activity;
  return scanContextOf(state, now);
}

export function activeGroups(state) {
  return Object.values(state.groups)
    .filter((g) => g.status === 'active')
    .sort((a, b) => a.startTimeMs - b.startTimeMs);
}

export function rosterOf(state, group) {
  return (group.memberIds || []).map((id) => state.sessions[id]).filter(Boolean);
}

export function totalBilledSatang(state) {
  // Backend mode: the server is the ledger (`GET /groups` reports what it has actually taken).
  if (state.billPreview && typeof state.billPreview.billed === 'number') return state.billPreview.billed;
  let total = 0;
  for (const session of Object.values(state.sessions)) {
    // Group check-outs are billed once on the group; per-session amounts are individual ones.
    if (session.status === 'closed' && typeof session.amount === 'number') total += session.amount;
  }
  for (const group of Object.values(state.groups)) {
    if (group.bill) total += group.bill.amount;
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Planners — pure. Given a snapshot + a command, return the document writes and log events.
// Both backends run these, so 'local' and 'firestore' can never drift apart.
// ---------------------------------------------------------------------------------------------

function event(text, { tagId = null, action, endpoint, result = 'ok', audited = true }) {
  return { text, tagId, action, endpoint, result, audited };
}

function writesForReader(reader) {
  return { path: [COLLECTIONS.reader, COLLECTIONS.readerDoc], data: { ...reader } };
}

/**
 * The §3.1 decision table: existing member -> roster; unknown tag inside the window -> join;
 * unknown tag with no window -> new group.
 */
export function planScan(snap, cmd, now) {
  const reader = { ...DEFAULT_READER, ...(snap.reader || {}) };
  const { tagId, label = null } = cmd;
  const writes = [];

  let entry = snap.tagEntry || null;
  let memberGroup = snap.memberGroup || null;

  // A tag pointing at a group that no longer exists (or is closed) is stale: forget it.
  if (entry && (!memberGroup || memberGroup.status !== 'active')) {
    writes.push({ path: [COLLECTIONS.tags, tagId], delete: true });
    entry = null;
    memberGroup = null;
  }

  // (c) already-checked-in tag -> show that group's roster, and (re)open the join window.
  if (entry && memberGroup) {
    Object.assign(reader, {
      screen: 'group',
      openGroupId: memberGroup.groupId,
      openUntilMs: now + JOIN_WINDOW_MS,
      screenUntilMs: now + SCREEN_TIMEOUT_MS,
      scan: { groupId: memberGroup.groupId, memberId: entry.sessionId, tagId },
    });
    writes.push(writesForReader(reader));
    return {
      screen: 'group',
      groupId: memberGroup.groupId,
      writes,
      events: [event(`${tagId} scanned · roster opened for ${memberGroup.groupId}`, {
        tagId, action: 'scan.roster', endpoint: 'POST /api/v1/scans',
      })],
    };
  }

  const sessionId = `sess_${tagId}_${now}`;
  const session = {
    sessionId, tagId, label, groupId: null,
    checkInMs: now, checkOutMs: null, status: 'open', amount: null,
  };

  // (b) unknown tag inside an open window -> join that group.
  // The deadline is re-checked HERE, not by the caller: a backend that hands over a group without
  // filtering (Firestore reads `readerState.openGroupId` eagerly) must not be able to turn the
  // 30-second join window into an unbounded one.
  const windowOpen = now < (reader.openUntilMs || 0);
  const openGroup = windowOpen && snap.openGroup && snap.openGroup.status === 'active' ? snap.openGroup : null;
  if (openGroup) {
    session.groupId = openGroup.groupId;
    writes.push({ path: [COLLECTIONS.sessions, sessionId], data: session });
    writes.push({
      path: [COLLECTIONS.groups, openGroup.groupId],
      merge: true,
      data: { memberIds: [...(openGroup.memberIds || []), sessionId] },
    });
    writes.push({ path: [COLLECTIONS.tags, tagId], data: { sessionId, groupId: openGroup.groupId } });
    Object.assign(reader, {
      screen: 'joined',
      openGroupId: openGroup.groupId,
      openUntilMs: now + JOIN_WINDOW_MS,
      screenUntilMs: now + SCREEN_TIMEOUT_MS,
      scan: null,
    });
    writes.push(writesForReader(reader));
    return {
      screen: 'joined',
      groupId: openGroup.groupId,
      writes,
      events: [event(`${tagId} joined ${openGroup.groupId}`, {
        tagId, action: 'scan.join', endpoint: 'POST /api/v1/scans',
      })],
    };
  }

  // (a) unknown tag, no open window -> brand-new group.
  const n = (snap.counter || 0) + 1;
  const groupId = 'grp_' + String(n).padStart(2, '0');
  session.groupId = groupId;
  writes.push({ path: [COLLECTIONS.counters, COLLECTIONS.counterDoc], data: { n } });
  writes.push({
    path: [COLLECTIONS.groups, groupId],
    data: { groupId, status: 'active', startTimeMs: now, memberIds: [sessionId], bill: null },
  });
  writes.push({ path: [COLLECTIONS.sessions, sessionId], data: session });
  writes.push({ path: [COLLECTIONS.tags, tagId], data: { sessionId, groupId } });
  Object.assign(reader, {
    screen: 'waiting',
    openGroupId: groupId,
    openUntilMs: now + JOIN_WINDOW_MS,
    screenUntilMs: now + SCREEN_TIMEOUT_MS,
    scan: null,
  });
  writes.push(writesForReader(reader));
  return {
    screen: 'waiting',
    groupId,
    writes,
    events: [event(`${tagId} started ${groupId} · waiting for friends`, {
      tagId, action: 'scan.new-group', endpoint: 'POST /api/v1/scans',
    })],
  };
}

/** Individual check-out: bills that member from their own check-in time. */
export function planCheckoutOne(snap, cmd, now) {
  const group = snap.group;
  const session = snap.session;
  if (!group) return { error: 'GROUP_NOT_FOUND' };
  if (!session) return { error: 'SESSION_NOT_FOUND' };
  if (session.status !== 'open') return { error: 'SESSION_ALREADY_CLOSED' };
  // ETA §9 / api-convention §8.5: the confirmation must be explicit, never implied.
  if (cmd.customerConfirmed !== true) return { error: 'CONFIRMATION_REQUIRED' };

  const amount = amountFor(session.checkInMs, now, 1);
  const writes = [
    {
      path: [COLLECTIONS.sessions, session.sessionId],
      merge: true,
      data: { status: 'closed', checkOutMs: now, amount, customerConfirmed: true },
    },
  ];

  const memberIds = (group.memberIds || []).filter((id) => id !== session.sessionId);
  const patch = { memberIds };
  if (!memberIds.length) {
    patch.status = 'closed';
    patch.closedMs = now;
    patch.bill = { amount, ratePerHour: RATE_PER_HOUR_SATANG, kind: 'individual-last-member', checkedOutMs: now };
  }
  writes.push({ path: [COLLECTIONS.groups, group.groupId], merge: true, data: patch });
  writes.push({ path: [COLLECTIONS.tags, session.tagId], delete: true });

  const reader = {
    ...DEFAULT_READER,
    ...(snap.reader || {}),
    screen: 'success',
    screenUntilMs: now + SCREEN_TIMEOUT_MS,
    openGroupId: null,
    openUntilMs: 0,
    scan: null,
  };
  writes.push(writesForReader(reader));

  return {
    screen: 'success',
    amount,
    writes,
    events: [event(
      `${session.tagId} checked out · ${baht(amount)} · ${memberIds.length} left in ${group.groupId}`,
      { tagId: session.tagId, action: 'session.check-out', endpoint: 'POST /api/v1/sessions/:sessionId/check-out' },
    )],
  };
}

/** Whole-group check-out: the demo's rule bills group elapsed time × member count. */
export function planCheckoutAll(snap, cmd, now) {
  const group = snap.group;
  if (!group) return { error: 'GROUP_NOT_FOUND' };
  if (group.status !== 'active') return { error: 'GROUP_ALREADY_CLOSED' };
  if (cmd.customerConfirmed !== true) return { error: 'CONFIRMATION_REQUIRED' };

  const sessions = (group.memberIds || [])
    .map((id) => snap.sessions?.[id])
    .filter((s) => s && s.status === 'open');

  if (!sessions.length) return { error: 'GROUP_EMPTY' };

  const amount = amountFor(group.startTimeMs, now, sessions.length);
  const writes = [];
  for (const session of sessions) {
    writes.push({
      path: [COLLECTIONS.sessions, session.sessionId],
      merge: true,
      data: { status: 'closed', checkOutMs: now, amount: null, billedOnGroup: group.groupId },
    });
    writes.push({ path: [COLLECTIONS.tags, session.tagId], delete: true });
  }
  writes.push({
    path: [COLLECTIONS.groups, group.groupId],
    merge: true,
    data: {
      status: 'closed',
      memberIds: [],
      closedMs: now,
      bill: {
        amount,
        ratePerHour: RATE_PER_HOUR_SATANG,
        kind: 'group',
        memberCount: sessions.length,
        checkedOutMs: now,
      },
    },
  });

  const reader = {
    ...DEFAULT_READER,
    ...(snap.reader || {}),
    screen: 'success',
    screenUntilMs: now + SCREEN_TIMEOUT_MS,
    openGroupId: null,
    openUntilMs: 0,
    scan: null,
  };
  writes.push(writesForReader(reader));

  return {
    screen: 'success',
    amount,
    writes,
    events: [event(
      `${group.groupId} checked out · ${baht(amount)} · ${sessions.length} players`,
      { tagId: null, action: 'group.check-out', endpoint: 'POST /api/v1/groups/:groupId/check-out' },
    )],
  };
}

/** The reader's close button — clears display state only, so it is not an audited action. */
export function planDismiss(snap, now) {
  const reader = {
    ...DEFAULT_READER,
    ...(snap.reader || {}),
    screen: 'idle',
    screenUntilMs: now + SCREEN_TIMEOUT_MS,
    openGroupId: null,
    openUntilMs: 0,
    scan: null,
  };
  return {
    screen: 'idle',
    writes: [writesForReader(reader)],
    events: [event('Reader dismissed · open group cleared', {
      action: 'reader.dismiss', endpoint: 'POST /api/v1/reader/dismiss', audited: false,
    })],
  };
}

/**
 * Clears operational data only. Audit entries are retained, mirroring `api-convention.md` §8.2
 * ("no DELETE route for logs before the retention window") — deletion there is a scheduled job.
 */
export function planReset(snap, now) {
  const writes = [];
  for (const id of Object.keys(snap.groups || {})) writes.push({ path: [COLLECTIONS.groups, id], delete: true });
  for (const id of Object.keys(snap.sessions || {})) writes.push({ path: [COLLECTIONS.sessions, id], delete: true });
  for (const id of Object.keys(snap.tags || {})) writes.push({ path: [COLLECTIONS.tags, id], delete: true });
  writes.push({ path: [COLLECTIONS.counters, COLLECTIONS.counterDoc], data: { n: 0 } });
  writes.push(writesForReader({ ...DEFAULT_READER, screenUntilMs: now + SCREEN_TIMEOUT_MS }));
  return {
    screen: 'idle',
    writes,
    events: [event('Demo reset · audit trail retained', {
      action: 'demo.reset', endpoint: 'demo/reset', audited: false,
    })],
  };
}

export function planCommand(snap, cmd, now) {
  switch (cmd && cmd.type) {
    case 'scan': return planScan(snap, cmd, now);
    case 'checkout-one': return planCheckoutOne(snap, cmd, now);
    case 'checkout-all': return planCheckoutAll(snap, cmd, now);
    case 'dismiss': return planDismiss(snap, now);
    case 'reset': return planReset(snap, now);
    default: return { error: 'VALIDATION_ERROR' };
  }
}

// ---------------------------------------------------------------------------------------------
// Firestore backend — realtime sync between devices, transactions to stop double billing.
// ---------------------------------------------------------------------------------------------

const stripUndefined = (value) => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = stripUndefined(v);
    return out;
  }
  return value;
};

/** Optional local config file; absent by default so the demo runs emulator-first. */
async function loadFirebaseConfig() {
  try {
    const mod = await import('./firebase-config.js');
    return mod.default || mod.firebaseConfig || null;
  } catch {
    return null;
  }
}

async function createFirestoreBackend(setState, setStatus) {
  setStatus({ backend: 'firestore', status: 'connecting', detail: 'loading Firebase SDK…' });

  const [appMod, fs, authMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
  ]);

  const config = await loadFirebaseConfig();
  const useEmulator = !config || config.useEmulator === true || !config.apiKey;
  const app = appMod.initializeApp(
    useEmulator
      ? { projectId: EMULATOR.projectId, apiKey: 'demo-only-unused-key', appId: 'demo-app' }
      : config,
  );
  const db = fs.getFirestore(app);
  const auth = authMod.getAuth(app);

  if (useEmulator) {
    fs.connectFirestoreEmulator(db, EMULATOR.host, EMULATOR.firestore);
    authMod.connectAuthEmulator(auth, `http://${EMULATOR.host}:${EMULATOR.auth}`, { disableWarnings: true });
  }

  setStatus({
    backend: 'firestore',
    status: 'connecting',
    detail: useEmulator ? `emulator ${EMULATOR.projectId} @ ${EMULATOR.host}` : 'signing in anonymously…',
  });

  // Anonymous auth is the minimum needed for the rules in `firestore.rules` to say
  // "authenticated callers only" instead of "anyone on the internet".
  await authMod.signInAnonymously(auth);

  let state = emptyState();
  const unsubscribes = [];

  const connectionDetail = () => (useEmulator
    ? `emulator · ${EMULATOR.projectId}`
    : `firestore · ${config?.projectId || ''}`).trim();

  const markOnline = () => setStatus({ backend: 'firestore', status: 'online', detail: connectionDetail() });
  const markOffline = (detail) => setStatus({ backend: 'firestore', status: 'offline', detail });
  const onError = (err) => markOffline(err?.code || err?.message || 'connection lost');

  const publish = () => setState(state);

  unsubscribes.push(fs.onSnapshot(
    fs.doc(db, COLLECTIONS.reader, COLLECTIONS.readerDoc),
    (snap) => {
      state = { ...state, reader: snap.exists() ? { ...DEFAULT_READER, ...snap.data() } : { ...DEFAULT_READER } };
      // `metadata.fromCache` is the honest signal: a snapshot served from Firestore's local cache
      // means we are not talking to the server right now. It is also briefly true while a listener
      // is still being established, so only a cached snapshot on an offline device flips the
      // indicator — otherwise we would flash OFFLINE on every page load.
      if (snap.metadata && snap.metadata.fromCache) {
        if (!isDeviceOnline()) markOffline('offline · showing cached state');
      } else {
        markOnline();
      }
      publish();
    },
    onError,
  ));

  for (const [key, collection] of [
    ['groups', COLLECTIONS.groups],
    ['sessions', COLLECTIONS.sessions],
    ['tags', COLLECTIONS.tags],
    ['counters', COLLECTIONS.counters],
  ]) {
    unsubscribes.push(fs.onSnapshot(
      fs.collection(db, collection),
      (snap) => {
        const map = {};
        snap.forEach((d) => { map[d.id] = d.data(); });
        state = { ...state, [key]: map };
        publish();
      },
      onError,
    ));
  }

  // The activity view renders the audit stream itself — no parallel "log" document to keep in sync.
  unsubscribes.push(fs.onSnapshot(
    fs.query(fs.collection(db, COLLECTIONS.audit), fs.orderBy('at', 'desc'), fs.limit(40)),
    (snap) => {
      const logs = [];
      snap.forEach((d) => {
        const e = d.data();
        logs.push({
          at: e.at?.toMillis ? e.at.toMillis() : null,
          text: e.text || `${e.action} · ${e.result}`,
          audited: e.audited !== false,
        });
      });
      state = { ...state, logs };
      publish();
    },
    onError,
  ));

  /** Assemble exactly the snapshot the planners expect — reads only, no writes. */
  async function readSnapshot(tx, cmd) {
    const snap = {
      reader: { ...DEFAULT_READER },
      counter: 0,
      groups: {}, sessions: {}, tags: {},
      tagEntry: null, memberGroup: null, openGroup: null, group: null, session: null,
    };

    const readerSnap = await tx.get(fs.doc(db, COLLECTIONS.reader, COLLECTIONS.readerDoc));
    if (readerSnap.exists()) snap.reader = { ...DEFAULT_READER, ...readerSnap.data() };

    const counterSnap = await tx.get(fs.doc(db, COLLECTIONS.counters, COLLECTIONS.counterDoc));
    if (counterSnap.exists()) snap.counter = counterSnap.data().n || 0;

    const readSession = async (sessionId) => {
      if (!sessionId || snap.sessions[sessionId]) return snap.sessions[sessionId] || null;
      const s = await tx.get(fs.doc(db, COLLECTIONS.sessions, sessionId));
      if (!s.exists()) return null;
      snap.sessions[sessionId] = s.data();
      return snap.sessions[sessionId];
    };

    const readGroup = async (groupId) => {
      if (!groupId || snap.groups[groupId]) return snap.groups[groupId] || null;
      const g = await tx.get(fs.doc(db, COLLECTIONS.groups, groupId));
      if (!g.exists()) return null;
      snap.groups[groupId] = g.data();
      for (const memberId of snap.groups[groupId].memberIds || []) await readSession(memberId);
      return snap.groups[groupId];
    };

    if (cmd.type === 'scan') {
      const tagSnap = await tx.get(fs.doc(db, COLLECTIONS.tags, cmd.tagId));
      if (tagSnap.exists()) {
        snap.tagEntry = tagSnap.data();
        snap.tags[cmd.tagId] = snap.tagEntry;
        snap.memberGroup = await readGroup(snap.tagEntry.groupId);
      }
      // Only worth reading while the window is open. `planScan` re-checks the deadline itself, so
      // this is purely to avoid paying for a pointless read.
      if (snap.reader.openGroupId && Date.now() < (snap.reader.openUntilMs || 0)) {
        snap.openGroup = await readGroup(snap.reader.openGroupId);
      }
    } else if (cmd.type === 'checkout-one') {
      snap.group = await readGroup(cmd.groupId);
      snap.session = await readSession(cmd.sessionId);
      if (snap.session?.tagId) {
        const t = await tx.get(fs.doc(db, COLLECTIONS.tags, snap.session.tagId));
        if (t.exists()) snap.tagEntry = t.data();
      }
    } else if (cmd.type === 'checkout-all') {
      snap.group = await readGroup(cmd.groupId);
    }

    return snap;
  }

  const commitPlan = (tx, plan) => {
    for (const w of plan.writes) {
      const ref = fs.doc(db, ...w.path);
      if (w.delete) tx.delete(ref);
      else tx.set(ref, stripUndefined(w.data), w.merge ? { merge: true } : undefined);
    }
    for (const e of plan.events) {
      // Audit entries always carry the actor + a server timestamp (CCA §26).
      tx.set(fs.doc(fs.collection(db, COLLECTIONS.audit)), {
        actor: clientId,
        actorKind: 'device',
        audited: e.audited !== false,
        tagId: e.tagId,
        action: e.action,
        endpoint: e.endpoint,
        result: e.result,
        text: e.text,
        at: fs.serverTimestamp(),
      });
    }
  };

  return {
    name: 'firestore',
    async dispatch(cmd) {
      try {
        const result = await fs.runTransaction(db, async (tx) => {
          const now = Date.now();
          const snapshot = await readSnapshot(tx, cmd);
          const plan = planCommand(snapshot, cmd, now);
          if (plan.error) return { error: plan.error };
          commitPlan(tx, plan);
          return { screen: plan.screen, amount: plan.amount ?? null };
        });
        // A transaction only resolves after the commit round-trips to the server, so this is
        // proof of reachability — and it also brings the indicator back after a reconnect that
        // produced no data change (no snapshot fires in that case).
        markOnline();
        return result;
      } catch (err) {
        onError(err);
        return {
          error: err?.code || 'SYNC_FAILED',
          message: 'Firestore write failed — is the emulator running?',
        };
      }
    },
    /**
     * Force a server round-trip and report the result, retrying briefly.
     *
     * Used when the device comes back online: Firestore will not push a snapshot if nothing
     * changed while we were away, and the network is often not usable the instant the browser
     * reports it is. Only after every attempt fails do we show OFFLINE.
     */
    async probe({ attempts = 4, delayMs = 2000 } = {}) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (!isDeviceOnline()) return false; // the device dropped again; the offline handler owns it
        try {
          await fs.getDocFromServer(fs.doc(db, COLLECTIONS.reader, COLLECTIONS.readerDoc));
          markOnline();
          return true;
        } catch (err) {
          if (attempt === attempts - 1) {
            onError(err);
            return false;
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      return false;
    },
    async reset() {
      // Queries cannot run inside a transaction, so collect the ids first, then delete in a batch.
      const snapshot = { groups: {}, sessions: {}, tags: {}, counters: {} };
      for (const [key, collection] of [
        ['groups', COLLECTIONS.groups],
        ['sessions', COLLECTIONS.sessions],
        ['tags', COLLECTIONS.tags],
      ]) {
        const all = await fs.getDocs(fs.collection(db, collection));
        all.forEach((d) => { snapshot[key][d.id] = d.data(); });
      }
      const now = Date.now();
      const plan = planReset(snapshot, now);
      const batch = fs.writeBatch(db);
      for (const w of plan.writes) {
        const ref = fs.doc(db, ...w.path);
        if (w.delete) batch.delete(ref);
        else batch.set(ref, stripUndefined(w.data));
      }
      for (const e of plan.events) {
        batch.set(fs.doc(fs.collection(db, COLLECTIONS.audit)), {
          actor: clientId,
          actorKind: 'device',
          audited: e.audited !== false,
          tagId: e.tagId,
          action: e.action,
          endpoint: e.endpoint,
          result: e.result,
          text: e.text,
          at: fs.serverTimestamp(),
        });
      }
      await batch.commit();
      markOnline();
      return { screen: 'idle' };
    },
    dispose() {
      for (const unsub of unsubscribes) unsub();
      unsubscribes.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// REST + WebSocket backend — talks to the ElysiaJS API (`backend/`, docs/api-contract.md)
// ---------------------------------------------------------------------------------------------

/**
 * Development defaults, matching `docs/backend-mvp.md`. `Demo/backend-config.js` (gitignored) can
 * override any of them; with no config file the demo points at the local MVP backend, the same way
 * the Firestore path defaults to its emulator.
 */
export const BACKEND_DEFAULTS = {
  baseUrl: 'http://localhost:3000',
  deviceKey: 'dev-device-key',
  staffToken: 'dev-staff-token',
  staffId: 'staff-dev-1',
};

/** The demo's eight synthetic cards. Raw UIDs are synthetic too — never a real tag's UID (PDPA). */
export const DEMO_CARDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const rawUidFor = (letter) => `DEMO-CARD-${letter}`;

/** Optional local config file; absent by default so the demo runs against localhost with no setup. */
async function loadBackendConfig() {
  try {
    const mod = await import('./backend-config.js');
    return { ...BACKEND_DEFAULTS, ...(mod.default || mod.backendConfig || mod) };
  } catch {
    return { ...BACKEND_DEFAULTS };
  }
}

async function createRestBackend(setState, setStatus) {
  const config = { ...BACKEND_DEFAULTS, ...(await loadBackendConfig()) };
  const baseUrl = String(config.baseUrl || BACKEND_DEFAULTS.baseUrl).replace(/\/+$/, '');
  const wsBase = baseUrl.replace(/^http/i, 'ws');
  const deviceHeaders = { 'x-device-key': config.deviceKey };
  const staffHeaders = { authorization: `Bearer ${config.staffToken}` };
  const detail = () => `backend · ${baseUrl}`;

  setStatus({ backend: 'rest', status: 'connecting', detail: 'checking backend…' });

  /** One fetch wrapper: JSON in, `{data,meta,reader}` out, error envelope turned into a throw. */
  async function api(method, path, { body, headers } = {}) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(headers || {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload?.error?.code || `HTTP_${response.status}`;
      const error = new Error(payload?.error?.message || `${method} ${path} failed`);
      error.code = code;
      error.details = payload?.error?.details || null;
      throw error;
    }
    return payload;
  }

  // ---- identity map: demo card letter <-> backend tag identity ---------------------------------
  const tagIdByLetter = new Map();
  const letterByTagId = new Map();
  const demoTagId = (backendTagId) => 'tag_' + (letterByTagId.get(backendTagId)
    || String(backendTagId || '').replace(/-/g, '').slice(0, 4));
  const labelOfTag = (backendTagId) => letterByTagId.get(backendTagId) || null;

  async function registerCards() {
    for (const letter of DEMO_CARDS) {
      const registered = await api('POST', '/api/v1/nfc-tags', {
        headers: staffHeaders,
        body: { rawTagUid: rawUidFor(letter), label: letter },
      });
      tagIdByLetter.set(letter, registered.data.tagId);
      letterByTagId.set(registered.data.tagId, letter);
    }
  }

  // ---- state -----------------------------------------------------------------------------------
  let state = emptyState();
  let activity = null;            // last scan seen by staff (`/ws/admin` scan.activity)
  let readerSocket = null;
  let adminSocket = null;
  let pollTimer = null;
  let reconnectTimer = null;
  let disposed = false;

  const publish = () => setState({ ...state, activity });
  const pushLog = (text, audited = true) => {
    state = { ...state, logs: [{ at: Date.now(), text, audited }, ...state.logs].slice(0, 40) };
  };

  async function refresh() {
    const [active, closed] = await Promise.all([
      api('GET', '/api/v1/groups?status=active', { headers: staffHeaders }),
      api('GET', '/api/v1/groups?status=closed', { headers: staffHeaders }),
    ]);
    const groups = {};
    const sessions = {};
    for (const group of [...active.data, ...closed.data]) {
      groups[group.groupId] = {
        groupId: group.groupId,
        status: group.status,
        startTimeMs: Date.parse(group.startTime),
        memberIds: group.tags.map((t) => t.sessionId),
        amountSatang: group.amountSatang,
        bill: null,
      };
      for (const tag of group.tags) {
        sessions[tag.sessionId] = {
          sessionId: tag.sessionId,
          tagId: demoTagId(tag.tagId),
          label: tag.label || labelOfTag(tag.tagId),
          groupId: group.groupId,
          checkInMs: Date.parse(tag.checkInTime),
          checkOutMs: null,
          status: 'open',
          amountSatang: tag.amountSatang,
        };
      }
    }
    const reader = active.reader || {};
    state = {
      ...state,
      groups,
      sessions,
      tags: {},
      counters: {},
      // The join window is the backend's, not a local countdown (docs/api-contract.md §3.1).
      reader: {
        ...state.reader,
        openGroupId: reader.openGroupId || null,
        openUntilMs: reader.openUntil ? Date.parse(reader.openUntil) : 0,
      },
      billPreview: {
        current: reader.currentBillSatang ?? 0,
        billed: reader.billedSatang ?? 0,
        ratePerHour: reader.ratePerHour ?? RATE_PER_HOUR_SATANG,
        activePlayers: reader.activePlayers ?? 0,
      },
    };
    publish();
    return state;
  }

  /** Apply a `POST /api/v1/scans` (or `/ws/reader`) screen payload to the reader's display state. */
  function applyReaderScreen(data, ttl = SCREEN_TIMEOUT_MS) {
    const now = Date.now();
    const screen = data.screen || 'idle';
    state = {
      ...state,
      reader: {
        ...state.reader,
        screen,
        screenUntilMs: now + ttl,
        openGroupId: data.groupId || state.reader.openGroupId,
        scan: null,
      },
    };
  }

  /** §3.2: the reader socket is open *only* while the group screen is showing. */
  function syncReaderSocket() {
    if (disposed) return;
    const shouldBeOpen = screenOf(state) === 'group';
    if (shouldBeOpen && (!readerSocket || readerSocket.readyState > 1)) {
      try {
        readerSocket = new WebSocket(`${wsBase}/ws/reader?deviceKey=${encodeURIComponent(config.deviceKey)}`);
        readerSocket.addEventListener('message', (event) => {
          let payload = null;
          try { payload = JSON.parse(event.data); } catch { return; }
          if (!payload?.data?.screen) return;                 // error envelope: nothing to render
          applyReaderScreen(payload.data);
          pushLog(`reader push · screen ${payload.data.screen}`
            + (payload.data.bill ? ` · ${baht(payload.data.bill.amount)}` : '')
            + (payload.data.tagRemoved ? ` · ${labelOfTag(payload.data.tagRemoved) || 'member'} removed` : ''));
          refresh().catch(() => {});
        });
        readerSocket.addEventListener('close', () => { readerSocket = null; startPolling(); });
        readerSocket.addEventListener('error', () => { readerSocket = null; startPolling(); });
      } catch {
        startPolling();
      }
    } else if (!shouldBeOpen && readerSocket) {
      try { readerSocket.close(); } catch { /* already gone */ }
      readerSocket = null;
      stopPolling();
    }
    if (shouldBeOpen) startPolling();   // §3.2 requires the polling fallback to exist alongside WS
  }

  /** §3.2 fallback: poll `GET /api/v1/reader/state` while the group screen is up but no socket is. */
  function startPolling() {
    // Bail while a socket exists in any live state (CONNECTING or OPEN) — polling is the fallback for
    // when the reader socket is *not* there, and running both means the same outcome is delivered twice.
    if (disposed || pollTimer || screenOf(state) !== 'group' || (readerSocket && readerSocket.readyState <= 1)) return;
    pollTimer = setInterval(async () => {
      if (screenOf(state) !== 'group') { stopPolling(); return; }
      try {
        const response = await fetch(`${baseUrl}/api/v1/reader/state`, { headers: deviceHeaders });
        if (response.status === 204) { markOnline(); return; }   // nothing pending: keep the screen
        const payload = await response.json();
        applyReaderScreen(payload.data);
        pushLog(`reader poll · screen ${payload.data.screen}`);
        await refresh();
        stopPolling();
      } catch {
        markOffline('reader poll failed');
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // ---- staff channel (`/ws/admin`) -------------------------------------------------------------
  const markOnline = () => setStatus({ backend: 'rest', status: 'online', detail: detail() });
  const markOffline = (why) => setStatus({ backend: 'rest', status: 'offline', detail: why || 'connection lost' });

  function connectAdminSocket() {
    if (disposed) return;
    try {
      adminSocket = new WebSocket(`${wsBase}/ws/admin?token=${encodeURIComponent(config.staffToken)}`);
    } catch {
      scheduleReconnect();
      return;
    }
    adminSocket.addEventListener('open', () => { markOnline(); publish(); });
    adminSocket.addEventListener('message', (event) => {
      let payload = null;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (payload?.error) return;
      if (payload.event === 'scan.activity') {
        activity = {
          groupId: payload.data.groupId,
          memberId: payload.data.sessionId,
          tagId: demoTagId(payload.data.scanningTagId),
          at: Date.parse(payload.ts) || Date.now(),
        };
        pushLog(`scan · ${labelOfTag(payload.data.scanningTagId) || 'card'} → ${payload.data.groupId}`);
        refresh().catch(() => {});
      } else if (payload.event === 'group.updated') {
        const group = payload.data;
        pushLog(`${group.groupId} updated · ${group.tags.length} player(s) · ${group.status}`);
        refresh().catch(() => {});
      } else if (payload.event === 'session.closed') {
        if (activity && activity.memberId === payload.data.sessionId) activity = null;
        pushLog(`session closed · ${payload.data.groupId}`);
        refresh().catch(() => {});
      }
      publish();
    });
    adminSocket.addEventListener('close', () => { adminSocket = null; markOffline('staff channel closed'); scheduleReconnect(); });
    adminSocket.addEventListener('error', () => { adminSocket = null; markOffline('staff channel unavailable'); scheduleReconnect(); });
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectAdminSocket();
    }, 2000);
  }

  /**
   * Confirm a check-out. The bill is priced from the backend's own clock, so a figure read a moment
   * earlier can be one rounding tick stale; the backend answers `BILL_AMOUNT_MISMATCH` with the amount
   * to confirm and we re-confirm with exactly that. More than one attempt on purpose: over a slow link
   * (a cloud database, a phone on café Wi-Fi) even the retry can land a tick late.
   */
  async function confirmCheckout(path, amount) {
    let figure = amount;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const done = await api('POST', path, {
          headers: staffHeaders,
          body: { staffId: config.staffId, amount: figure, customerConfirmed: true },
        });
        return { screen: 'success', amount: done.data.receipt.amount };
      } catch (error) {
        if (error.code === 'BILL_AMOUNT_MISMATCH' && error.details?.amount !== undefined) {
          figure = error.details.amount;
          continue;
        }
        return { error: error.code, message: error.message };
      }
    }
    return { error: 'BILL_AMOUNT_MISMATCH', message: 'The bill kept changing — try again.' };
  }

  // ---- dispatch: one command per contract endpoint ---------------------------------------------
  async function checkout(groupId, sessionId, { whole = false } = {}) {
    let amount;
    if (whole) {
      const fresh = await refresh();
      const group = fresh.groups[groupId];
      if (!group) return { error: 'GROUP_NOT_FOUND' };
      if (group.status !== 'active') return { error: 'GROUP_ALREADY_CLOSED' };
      if (!group.memberIds.length) return { error: 'GROUP_EMPTY' };
      amount = group.amountSatang;
      const path = `/api/v1/groups/${groupId}/check-out`;
      return confirmCheckout(path, amount);
    }

    const fresh = await refresh();
    const session = fresh.sessions[sessionId];
    if (!session) return { error: 'SESSION_ALREADY_CLOSED' };
    amount = session.amountSatang;
    const path = `/api/v1/sessions/${sessionId}/check-out`;
    return confirmCheckout(path, amount);
  }

  return {
    name: 'rest',
    async dispatch(cmd) {
      try {
        if (cmd.type === 'scan') {
          const letter = String(cmd.tagId || '').replace(/^tag_/, '');
          if (!tagIdByLetter.has(letter)) return { error: 'TAG_NOT_FOUND' };
          const scanned = await api('POST', '/api/v1/scans', {
            headers: deviceHeaders,
            body: { rawTagUid: rawUidFor(letter) },
          });
          applyReaderScreen(scanned.data);
          const fresh = await refresh();
          const tagId = tagIdByLetter.get(letter);
          // Own-tap staff context; the `/ws/admin` scan.activity event covers other windows.
          const member = Object.values(fresh.sessions).find((s) => s.tagId === demoTagId(tagId));
          activity = {
            groupId: scanned.data.groupId,
            memberId: member ? member.sessionId : null,
            tagId: demoTagId(tagId),
            at: Date.now(),
          };
          if (scanned.data.screen === 'group') {
            state = { ...state, reader: { ...state.reader, scan: activity } };
          }
          markOnline();
          publish();
          syncReaderSocket();
          return { screen: scanned.data.screen };
        }

        if (cmd.type === 'checkout-one') {
          const result = await checkout(cmd.groupId, cmd.sessionId);
          syncReaderSocket();   // a terminal screen closes the reader socket (docs/api-contract.md §3.2)
          return result;
        }

        if (cmd.type === 'checkout-all') {
          const result = await checkout(cmd.groupId, null, { whole: true });
          syncReaderSocket();
          return result;
        }

        if (cmd.type === 'dismiss') {
          await api('POST', '/api/v1/reader/dismiss', { headers: deviceHeaders });
          applyReaderScreen({ screen: 'idle' });
          activity = null;
          pushLog('Reader dismissed · open group cleared', false);
          await refresh();
          syncReaderSocket();
          return { screen: 'idle' };
        }

        if (cmd.type === 'reset') {
          await api('POST', '/api/v1/demo/reset', { headers: staffHeaders });
          activity = null;
          applyReaderScreen({ screen: 'idle' });
          pushLog('Demo reset · audit trail retained', false);
          await refresh();
          syncReaderSocket();
          return { screen: 'idle' };
        }

        return { error: 'VALIDATION_ERROR' };
      } catch (error) {
        markOffline(error.code || 'request failed');
        return { error: error.code || 'SYNC_FAILED', message: error.message };
      }
    },
    async probe() {
      try {
        await api('GET', '/health');
        markOnline();
        publish();
        return true;
      } catch {
        markOffline(`cannot reach ${baseUrl}`);
        return false;
      }
    },
    async reset() {
      await api('POST', '/api/v1/demo/reset', { headers: staffHeaders });
      applyReaderScreen({ screen: 'idle' });
      activity = null;
      await refresh();
      syncReaderSocket();
      return { screen: 'idle' };
    },
    dispose() {
      disposed = true;
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      for (const socket of [readerSocket, adminSocket]) {
        try { socket?.close(); } catch { /* already closed */ }
      }
      readerSocket = null;
      adminSocket = null;
    },
    /** Not part of the UI surface: used by `init()` to register the demo cards and open channels. */
    async connect() {
      await api('GET', '/health');
      setStatus({ backend: 'rest', status: 'connecting', detail: 'registering demo cards…' });
      await registerCards();
      publish();
      setStatus({ backend: 'rest', status: 'connecting', detail: 'opening staff channel…' });
      connectAdminSocket();
      await refresh();
      markOnline();
      publish();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The facade the demo talks to
// ---------------------------------------------------------------------------------------------

const listeners = new Set();
let currentState = emptyState();
let currentSync = { ...emptyState().sync };
let backend = null;

/**
 * Backends publish only data; the sync status is owned here and re-stamped on every publish, so a
 * backend's own state snapshot can never overwrite it (that bug made a live Firestore connection
 * report a stale status).
 */
function publishState(next) {
  currentState = { ...next, sync: currentSync };
  for (const listener of [...listeners]) listener(currentState);
}

function setSyncStatus(sync) {
  currentSync = sync;
  publishState(currentState);
}

// Device-level connectivity changes. Firestore reconnects on its own, so going online moves us to
// CONNECTING and then actively probes the server — a reconnected listener that has nothing new to
// report would otherwise leave the indicator stuck on CONNECTING forever.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    if (currentSync.status !== 'error') {
      setSyncStatus({ ...currentSync, status: 'offline', detail: 'offline · no network' });
    }
  });
  window.addEventListener('online', () => {
    if (currentSync.status === 'offline') {
      setSyncStatus({ ...currentSync, status: 'connecting', detail: 'reconnecting…' });
      if (backend && typeof backend.probe === 'function') backend.probe();
    }
  });
}

export const NFCSync = {
  getState: () => currentState,

  get sync() {
    return currentState.sync;
  },

  subscribe(listener) {
    listeners.add(listener);
    listener(currentState);
    return () => listeners.delete(listener);
  },

  /**
   * Connect to the backend. Safe to call repeatedly — the previous connection is disposed first.
   *
   * Default is the **ElysiaJS backend** (`backend/`, REST + WebSocket) because that is the system of
   * record: `docs/structure.md` §4 keeps state behind the API and `docs/api-convention.md` §3 gives
   * the browser no database credentials. `Demo/backend-config.js` can select `backend: 'firestore'`
   * to use the earlier Firestore plumbing instead.
   *
   * Either way there is no local/offline mode on purpose: if the backend is unreachable the demo says
   * so and stays empty, rather than running on state that would silently disagree with every other
   * device (`docs/api-contract.md` §3.1 has a single shared reader, so one stale copy is worse
   * than none).
   */
  async init() {
    if (backend) backend.dispose();
    backend = null;
    const config = await loadBackendConfig();
    const name = config.backend === 'firestore' ? 'firestore' : 'rest';
    currentSync = { backend: name, status: 'connecting', detail: 'starting…' };
    publishState(emptyState());

    try {
      backend = name === 'firestore'
        ? await createFirestoreBackend(publishState, setSyncStatus)
        : await createRestBackend(publishState, setSyncStatus);
      if (typeof backend.connect === 'function') await backend.connect();
    } catch (err) {
      setSyncStatus({
        backend: name,
        status: 'error',
        detail: err?.code || err?.message || `could not reach the ${name} backend`,
      });
    }

    return this.sync;
  },

  async dispatch(cmd) {
    if (!backend) {
      const sync = await this.init();
      if (!backend) return { error: 'SYNC_UNAVAILABLE', message: sync.detail };
    }
    if (cmd.type === 'reset') {
      try {
        return await backend.reset();
      } catch (err) {
        return { error: err?.code || 'SYNC_FAILED', message: 'Reset failed.' };
      }
    }
    return backend.dispatch(cmd);
  },
};

export default NFCSync;
