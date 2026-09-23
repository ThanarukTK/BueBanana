import { Elysia, t } from 'elysia';
import {
  IDEMPOTENCY_WINDOW_MS,
  JOIN_WINDOW_MS,
  RATE_PER_HOUR_SATANG,
  type Group,
  groupResponse,
  hashTagUid,
  moneyForDurationMs,
} from './domain';
import { MemoryStore } from './store';

const DEVICE_KEY = process.env.DEVICE_API_KEY ?? 'dev-device-key';
const STAFF_TOKEN = process.env.STAFF_API_TOKEN ?? 'dev-staff-token';
const STAFF_ID = process.env.DEV_STAFF_ID ?? 'staff-dev-1';

const errorBody = (code: string, message: string) => ({ error: { code, message } });

function staffIdFrom(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  return authorization === `Bearer ${STAFF_TOKEN}` ? STAFF_ID : null;
}

function requireDevice(request: Request): boolean {
  return request.headers.get('x-device-key') === DEVICE_KEY;
}

function getGroup(store: MemoryStore, groupId: string): Group | undefined {
  return store.groups.get(groupId);
}

function checkoutAmount(store: MemoryStore, sessionIds: string[], now: number): number {
  return sessionIds.reduce((total, sessionId) => {
    const session = store.sessions.get(sessionId);
    if (!session) return total;
    const end = session.checkOutTime ? Date.parse(session.checkOutTime) : now;
    return total + moneyForDurationMs(end - Date.parse(session.checkInTime));
  }, 0);
}

export function createApp(store = new MemoryStore()) {
  return new Elysia()
    .get('/health', () => ({ data: { status: 'ok' } }))
    .post('/api/v1/nfc-tags', ({ request, body, set }) => {
      const staffId = staffIdFrom(request);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      const tag = store.registerTag(body.rawTagUid, body.label ?? null);
      store.appendAudit({ actor: staffId, tagId: tag.tagId, action: 'tag.register', endpoint: '/api/v1/nfc-tags', result: 'success' });
      set.status = 201;
      return { data: { tagId: tag.tagId, label: tag.label, status: tag.status } };
    }, {
      body: t.Object({ rawTagUid: t.String({ minLength: 1 }), label: t.Optional(t.String({ maxLength: 80 })) }),
    })
    .post('/api/v1/scans', ({ request, body, set }) => {
      if (!requireDevice(request)) {
        set.status = 401;
        return errorBody('DEVICE_UNAUTHORIZED', 'Reader authentication required');
      }

      const now = Date.now();
      const uidHash = hashTagUid(body.rawTagUid);
      const recent = store.recentScans.get(uidHash);
      if (recent && now - recent.at <= IDEMPOTENCY_WINDOW_MS) return recent.response;

      const tag = store.findTag(body.rawTagUid);
      if (!tag) {
        store.appendAudit({ actor: 'system', tagId: null, action: 'scan', endpoint: '/api/v1/scans', result: 'failure' });
        set.status = 404;
        return errorBody('TAG_NOT_FOUND', 'NFC tag is not registered');
      }
      if (tag.status === 'disabled') {
        store.appendAudit({ actor: 'system', tagId: tag.tagId, action: 'scan', endpoint: '/api/v1/scans', result: 'failure' });
        set.status = 409;
        return errorBody('TAG_DISABLED', 'This card has been disabled');
      }

      const nowIso = new Date(now).toISOString();
      const existing = store.activeSessionForTag(tag.tagId);
      let group: Group;
      let screen: 'waiting' | 'joined' | 'group';
      if (existing) {
        group = store.groups.get(existing.groupId)!;
        screen = 'group';
      } else {
        const open = store.openGroup && store.openGroup.expiresAt > now ? store.groups.get(store.openGroup.groupId) : undefined;
        group = open && open.status === 'active' ? open : {
          groupId: crypto.randomUUID(), status: 'active', startTime: nowIso, sessionIds: [],
        };
        screen = open ? 'joined' : 'waiting';
        const session = {
          sessionId: crypto.randomUUID(), tagId: tag.tagId, groupId: group.groupId,
          checkInTime: nowIso, checkOutTime: null, status: 'open' as const,
        };
        store.sessions.set(session.sessionId, session);
        group.sessionIds.push(session.sessionId);
        store.groups.set(group.groupId, group);
      }
      store.openGroup = { groupId: group.groupId, expiresAt: now + JOIN_WINDOW_MS };
      const response = { data: screen === 'waiting' ? { screen, groupId: group.groupId, tagId: tag.tagId } : { screen, groupId: group.groupId, tags: groupResponse(group, store.sessions, store.tags).tags } };
      store.recentScans.set(uidHash, { at: now, response });
      store.appendAudit({ actor: 'system', tagId: tag.tagId, action: screen === 'group' ? 'scan.group' : 'check-in', endpoint: '/api/v1/scans', result: 'success' });
      return response;
    }, {
      body: t.Object({ rawTagUid: t.String({ minLength: 1 }) }),
    })
    .post('/api/v1/reader/dismiss', ({ request, set }) => {
      if (!requireDevice(request)) {
        set.status = 401;
        return errorBody('DEVICE_UNAUTHORIZED', 'Reader authentication required');
      }
      store.openGroup = null;
      return { data: { screen: 'idle' } };
    })
    .get('/api/v1/groups', ({ request, query, set }) => {
      const staffId = staffIdFrom(request);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      const groups = [...store.groups.values()]
        .filter((group) => !query.status || group.status === query.status)
        .map((group) => groupResponse(group, store.sessions, store.tags));
      store.appendAudit({ actor: staffId, tagId: null, action: 'groups.view', endpoint: '/api/v1/groups', result: 'success' });
      return { data: groups, meta: { page: 1, pageSize: groups.length, total: groups.length } };
    }, {
      query: t.Object({ status: t.Optional(t.Union([t.Literal('active'), t.Literal('closed')])) }),
    })
    .post('/api/v1/sessions/:sessionId/check-out', ({ request, params, body, set }) => {
      const staffId = staffIdFrom(request);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      if (!body.customerConfirmed) {
        set.status = 400;
        return errorBody('CONFIRMATION_REQUIRED', 'Explicit customer confirmation is required');
      }
      if (body.staffId !== staffId) {
        set.status = 403;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff identity does not match authenticated account');
      }
      const session = store.sessions.get(params.sessionId);
      if (!session || session.status === 'closed') {
        set.status = 404;
        return errorBody('SESSION_ALREADY_CLOSED', 'Session is not open');
      }
      const now = Date.now();
      const amount = moneyForDurationMs(now - Date.parse(session.checkInTime));
      if (body.amount !== amount) {
        set.status = 409;
        return errorBody('BILL_AMOUNT_MISMATCH', 'Confirmed amount does not match the current bill');
      }
      session.status = 'closed';
      session.checkOutTime = new Date(now).toISOString();
      const group = store.groups.get(session.groupId)!;
      group.sessionIds = group.sessionIds.filter((id) => id !== session.sessionId);
      if (group.sessionIds.length === 0) group.status = 'closed';
      const receipt = { amount, ratePerHour: RATE_PER_HOUR_SATANG, staffId, confirmedAt: session.checkOutTime, billVersion: 'rate-v1' };
      store.receipts.set(session.sessionId, receipt);
      store.appendAudit({ actor: staffId, tagId: session.tagId, action: 'check-out.individual', endpoint: `/api/v1/sessions/${session.sessionId}/check-out`, result: 'success' });
      return { data: { sessionId: session.sessionId, status: 'closed', receipt } };
    }, {
      body: t.Object({ staffId: t.String({ minLength: 1 }), amount: t.Integer({ minimum: 0 }), customerConfirmed: t.Boolean() }),
    })
    .post('/api/v1/groups/:groupId/check-out', ({ request, params, body, set }) => {
      const staffId = staffIdFrom(request);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      if (!body.customerConfirmed) {
        set.status = 400;
        return errorBody('CONFIRMATION_REQUIRED', 'Explicit customer confirmation is required');
      }
      if (body.staffId !== staffId) {
        set.status = 403;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff identity does not match authenticated account');
      }
      const group = getGroup(store, params.groupId);
      if (!group || group.status === 'closed') {
        set.status = 404;
        return errorBody('GROUP_NOT_FOUND', 'Active group was not found');
      }
      const now = Date.now();
      const amount = checkoutAmount(store, group.sessionIds, now);
      if (body.amount !== amount) {
        set.status = 409;
        return errorBody('BILL_AMOUNT_MISMATCH', 'Confirmed amount does not match the current bill');
      }
      const checkOutTime = new Date(now).toISOString();
      for (const sessionId of group.sessionIds) {
        const session = store.sessions.get(sessionId)!;
        session.status = 'closed';
        session.checkOutTime = checkOutTime;
        store.receipts.set(sessionId, { amount: 0, ratePerHour: RATE_PER_HOUR_SATANG, staffId, confirmedAt: checkOutTime, billVersion: 'rate-v1' });
      }
      group.status = 'closed';
      store.appendAudit({ actor: staffId, tagId: null, action: 'check-out.group', endpoint: `/api/v1/groups/${group.groupId}/check-out`, result: 'success' });
      return { data: { groupId: group.groupId, status: 'closed', receipt: { amount, ratePerHour: RATE_PER_HOUR_SATANG, staffId, confirmedAt: checkOutTime, billVersion: 'rate-v1' } } };
    }, {
      body: t.Object({ staffId: t.String({ minLength: 1 }), amount: t.Integer({ minimum: 0 }), customerConfirmed: t.Boolean() }),
    })
    .get('/api/v1/audit-logs', ({ request, set }) => {
      const staffId = staffIdFrom(request);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      store.appendAudit({ actor: staffId, tagId: null, action: 'audit.view', endpoint: '/api/v1/audit-logs', result: 'success' });
      return { data: store.audits.filter((entry) => entry.action !== 'audit.view') };
    });
}
