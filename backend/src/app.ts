import { Elysia, t } from 'elysia';
import { type Config, loadConfig } from './config';
import {
  JOIN_WINDOW_MS,
  RATE_PER_HOUR_SATANG,
  type Group,
  type GroupView,
  type RosterMember,
  type Session,
  groupResponse,
  hashTagUid,
  sessionAmountSatang,
} from './domain';
import {
  ADMIN_TOPIC,
  READER_TOPIC,
  groupUpdated,
  publishTo,
  readerScreen,
  scanActivity,
  sessionClosed,
} from './realtime';
import type { Repository } from './repository';
import { MemoryStore } from './stores/memory-store';

const errorBody = (code: string, message: string, details?: Record<string, unknown>) => ({
  error: { code, message, ...(details ? { details } : {}) },
});

// ---------------------------------------------------------------------------------------------
// Auth (`docs/api-convention.md` §3)
// ---------------------------------------------------------------------------------------------

function staffIdFrom(request: Request, config: Config): string | null {
  const authorization = request.headers.get('authorization');
  return authorization === `Bearer ${config.staffToken}` ? config.staffId : null;
}

/**
 * WebSocket handshakes from a browser cannot set custom headers (`new WebSocket(url)` sends no
 * header of our choosing), so the credential may also arrive as a query parameter. The header stays
 * the primary path: firmware and server-side clients use it, and `api-convention.md` §3 still
 * describes the header as the contract.
 */
function staffIdFromRequestOrQuery(request: Request, token: string | null, config: Config): string | null {
  return staffIdFrom(request, config) ?? (token && token === config.staffToken ? config.staffId : null);
}

function deviceAuthorized(request: Request, key: string | null, config: Config): boolean {
  return request.headers.get('x-device-key') === config.deviceKey || (!!key && key === config.deviceKey);
}

/** Reads a query parameter from a WS handshake, whichever way Elysia exposes it. */
function queryParam(data: any, name: string): string | null {
  const direct = data?.query?.[name];
  if (typeof direct === 'string') return direct;
  const url = data?.request?.url;
  if (typeof url === 'string') return new URL(url).searchParams.get(name);
  return null;
}

// ---------------------------------------------------------------------------------------------
// CORS — development only
// ---------------------------------------------------------------------------------------------

/**
 * The demo page is served from a static origin (`python -m http.server 8080`) while the API runs on
 * its own port, so every call from the browser is cross-origin and needs a preflight allowance.
 *
 * This is a **development/demo** concession: `api-convention.md` §1 puts the production frontend and
 * API behind one HTTPS host, where no CORS layer is needed. Nothing here allows credentials — the
 * device key and staff token travel as explicit headers, and no cookie is ever accepted.
 */
const CORS_ALLOW_HEADERS = 'content-type,authorization,x-device-key';

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': CORS_ALLOW_HEADERS,
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

// ---------------------------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------------------------

export type AppOptions = { repo?: Repository; config?: Config };

export function createApp(options: AppOptions = {}) {
  const repo = options.repo ?? new MemoryStore();
  const config = options.config ?? loadConfig();

  /**
   * Every handler below follows the same shape: one call to `repo.transaction`, which is where a real
   * database gets its atomicity. Nothing is published to a WebSocket inside that scope — a push must
   * never describe a write that could still roll back — so handlers return a result object and the
   * side effects happen after the scope resolves.
   */
  return new Elysia()
    .onRequest(({ request, set }) => {
      const headers = corsHeaders(request.headers.get('origin'));
      for (const [key, value] of Object.entries(headers)) set.headers[key] = value;
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    })
    .get('/health', () => ({ data: { status: 'ok', store: repo.kind } }))

    // -------------------------------------------------------------------------------------
    // Staff: NFC identity registration (PB-15)
    // -------------------------------------------------------------------------------------
    .post('/api/v1/nfc-tags', async ({ request, body, set }) => {
      const staffId = staffIdFrom(request, config);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      const tag = await repo.transaction(async (tx) => {
        const registered = await tx.registerTag(hashTagUid(body.rawTagUid, config.tagUidPepper), body.label ?? null);
        await tx.appendAudit({ actor: staffId, tagId: registered.tagId, action: 'tag.register', endpoint: '/api/v1/nfc-tags', result: 'success' });
        return registered;
      });
      set.status = 201;
      return { data: { tagId: tag.tagId, label: tag.label, status: tag.status } };
    }, {
      body: t.Object({ rawTagUid: t.String({ minLength: 1 }), label: t.Optional(t.String({ maxLength: 80 })) }),
    })

    // -------------------------------------------------------------------------------------
    // Reader: every tap, no exceptions (`docs/api-contract.md` §3.1)
    // -------------------------------------------------------------------------------------
    .post('/api/v1/scans', async ({ request, body, set, server }) => {
      if (!deviceAuthorized(request, null, config)) {
        set.status = 401;
        return errorBody('DEVICE_UNAUTHORIZED', 'Reader authentication required');
      }

      const now = Date.now();
      const uidHash = hashTagUid(body.rawTagUid, config.tagUidPepper);

      const outcome = await repo.transaction(async (tx) => {
        // §10 idempotency: a firmware retry on a flaky link must not double-create a session.
        const recent = await tx.recentScan(uidHash, now);
        if (recent) return { kind: 'deduped' as const, response: recent.response };

        const tag = await tx.findTagByUidHash(uidHash);
        if (!tag) {
          await tx.appendAudit({ actor: 'system', tagId: null, action: 'scan', endpoint: '/api/v1/scans', result: 'failure' });
          return { kind: 'error' as const, status: 404, body: errorBody('TAG_NOT_FOUND', 'NFC tag is not registered') };
        }
        if (tag.status === 'disabled') {
          await tx.appendAudit({ actor: 'system', tagId: tag.tagId, action: 'scan', endpoint: '/api/v1/scans', result: 'failure' });
          return { kind: 'error' as const, status: 409, body: errorBody('TAG_DISABLED', 'This card has been disabled') };
        }

        const nowIso = new Date(now).toISOString();
        const existing = await tx.openSessionForTag(tag.tagId);
        let group: Group;
        let screen: 'waiting' | 'joined' | 'group';
        let sessionId: string;
        let groupChanged: boolean;

        if (existing) {
          // Already checked in → always the roster, and this re-scan is what reopens the join window.
          group = (await tx.groupView(existing.groupId))!.group;
          screen = 'group';
          sessionId = existing.sessionId;
          groupChanged = false;
        } else {
          const open = await tx.openGroup();
          const openView = open && open.expiresAt > now ? await tx.groupView(open.groupId) : undefined;
          const joinable = openView && openView.group.status === 'active' ? openView : undefined;
          if (joinable) {
            group = joinable.group;
            screen = 'joined';
          } else {
            group = { groupId: crypto.randomUUID(), status: 'active', startTime: nowIso, sessionIds: [] };
            await tx.createGroup(group);
            screen = 'waiting';
          }
          const session: Session = {
            sessionId: crypto.randomUUID(), tagId: tag.tagId, groupId: group.groupId,
            checkInTime: nowIso, checkOutTime: null, status: 'open',
          };
          sessionId = session.sessionId;
          groupChanged = true;
          await tx.addSessionToGroup(group.groupId, session);
        }

        // §3.1 — *any* non-error tap points the join window at its group.
        await tx.setOpenGroup({ groupId: group.groupId, expiresAt: now + JOIN_WINDOW_MS });

        const view = (await tx.groupView(group.groupId))!;
        const projected = groupResponse(group, view.members, now);
        const response = {
          data: screen === 'waiting'
            ? { screen, groupId: group.groupId, tagId: tag.tagId }
            : { screen, groupId: group.groupId, tags: projected.tags },
        };
        await tx.rememberScan(uidHash, now, response);
        await tx.appendAudit({
          actor: 'system', tagId: tag.tagId, action: screen === 'group' ? 'scan.group' : 'check-in',
          endpoint: '/api/v1/scans', result: 'success',
        });
        return { kind: 'ok' as const, screen, response, groupId: group.groupId, tagId: tag.tagId, sessionId, groupChanged, view };
      });

      if (outcome.kind === 'deduped') return outcome.response;
      if (outcome.kind === 'error') {
        set.status = outcome.status;
        return outcome.body;
      }

      // §4.2 — staff see the tap the instant it resolves, and the group they are watching change.
      publishTo(server, ADMIN_TOPIC, scanActivity(outcome.groupId, outcome.tagId, outcome.sessionId));
      if (outcome.groupChanged) publishTo(server, ADMIN_TOPIC, groupUpdated(outcome.view, now));
      return outcome.response;
    }, {
      body: t.Object({ rawTagUid: t.String({ minLength: 1 }) }),
    })

    // §3.1.1 — the close button: clears the join window only, and is deliberately not audited.
    .post('/api/v1/reader/dismiss', async ({ request, set }) => {
      if (!deviceAuthorized(request, null, config)) {
        set.status = 401;
        return errorBody('DEVICE_UNAUTHORIZED', 'Reader authentication required');
      }
      await repo.transaction((tx) => tx.setOpenGroup(null));
      return { data: { screen: 'idle' } };
    })

    // §3.2 — polling fallback for a reader whose WebSocket dropped.
    //   200 = here is a screen to render · 204 = nothing pending, keep what you are showing.
    .get('/api/v1/reader/state', async ({ request, query, set }) => {
      if (!deviceAuthorized(request, query.deviceKey ?? null, config)) {
        set.status = 401;
        return errorBody('DEVICE_UNAUTHORIZED', 'Reader authentication required');
      }
      const outcome = await repo.transaction((tx) => tx.claimReaderOutcome());
      if (!outcome) {
        set.status = 204;
        return null;
      }
      return { data: { ...outcome.payload, groupId: outcome.groupId } };
    }, {
      query: t.Object({ deviceKey: t.Optional(t.String()) }),
    })

    // -------------------------------------------------------------------------------------
    // Staff: floor view + check-out (`docs/api-contract.md` §4.1)
    // -------------------------------------------------------------------------------------
    .get('/api/v1/groups', async ({ request, query, set }) => {
      const staffId = staffIdFrom(request, config);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      const now = Date.now();
      const snapshot = await repo.transaction(async (tx) => {
        const views = await tx.listGroupViews(query.status);
        const billedSatang = await tx.totalBilledSatang();
        const open = await tx.openGroup();
        await tx.appendAudit({ actor: staffId, tagId: null, action: 'groups.view', endpoint: '/api/v1/groups', result: 'success' });
        return { views, billedSatang, open };
      });
      const groups = snapshot.views.map((view) => groupResponse(view.group, view.members, now));
      const active = snapshot.views.filter((view) => view.group.status === 'active');
      return {
        data: groups,
        meta: { page: 1, pageSize: groups.length, total: groups.length },
        /**
         * Additive optional block (§3.4). Two facts the staff floor view needs and cannot derive
         * safely on its own: the current join window and the running total of what has been billed
         * this session. Both are backend-authoritative — the client only renders them.
         */
        reader: {
          openGroupId: snapshot.open && snapshot.open.expiresAt > now ? snapshot.open.groupId : null,
          openUntil: snapshot.open && snapshot.open.expiresAt > now ? new Date(snapshot.open.expiresAt).toISOString() : null,
          activeCount: active.length,
          activePlayers: active.reduce((total, view) => total + view.members.filter((m) => m.session.status === 'open').length, 0),
          currentBillSatang: active.reduce((total, view) => total + groupResponse(view.group, view.members, now).amountSatang, 0),
          billedSatang: snapshot.billedSatang,
          ratePerHour: RATE_PER_HOUR_SATANG,
        },
      };
    }, {
      query: t.Object({ status: t.Optional(t.Union([t.Literal('active'), t.Literal('closed')])) }),
    })

    .post('/api/v1/sessions/:sessionId/check-out', async ({ request, params, body, set, server }) => {
      const staffId = staffIdFrom(request, config);
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
      const now = Date.now();

      const outcome = await repo.transaction(async (tx) => {
        const session = await tx.getSession(params.sessionId);
        if (!session || session.status === 'closed') return { kind: 'not_open' as const };
        // Price from the locked view: the amount must be the one this transaction will actually close.
        const locked = await tx.lockGroup(session.groupId);
        const member = locked?.members.find((entry) => entry.session.sessionId === session.sessionId);
        if (!member || member.session.status !== 'open') return { kind: 'not_open' as const };
        const amount = sessionAmountSatang(member.session, now);
        if (body.amount !== amount) return { kind: 'mismatch' as const, amount };
        const checkOutTime = new Date(now).toISOString();
        const { closed, remaining } = await tx.detachSession(session.groupId, session.sessionId, checkOutTime);
        const receipt = { amount, ratePerHour: RATE_PER_HOUR_SATANG, staffId, confirmedAt: checkOutTime, billVersion: 'rate-v1' };
        await tx.saveReceipt(session.sessionId, receipt);
        await tx.appendAudit({
          actor: staffId, tagId: closed.tag.tagId, action: 'check-out.individual',
          endpoint: `/api/v1/sessions/${session.sessionId}/check-out`, result: 'success',
        });
        // §3.2 — the reader stays on the roster, minus the member who just paid.
        await tx.saveReaderOutcome({ groupId: session.groupId, payload: { screen: 'success', tagRemoved: closed.tag.tagId } });
        const view = (await tx.groupView(session.groupId))!;
        return { kind: 'ok' as const, amount, receipt, sessionId: session.sessionId, groupId: session.groupId, tagId: closed.tag.tagId, remaining, view };
      });

      if (outcome.kind === 'not_open') {
        set.status = 404;
        return errorBody('SESSION_ALREADY_CLOSED', 'Session is not open');
      }
      if (outcome.kind === 'mismatch') {
        // The amount is priced server-side, so a client whose preview went stale by a rounding tick
        // is told the exact figure to confirm rather than being left to guess.
        set.status = 409;
        return errorBody('BILL_AMOUNT_MISMATCH', 'Confirmed amount does not match the current bill', {
          amount: outcome.amount, ratePerHour: RATE_PER_HOUR_SATANG,
        });
      }

      publishTo(server, READER_TOPIC, readerScreen({
        screen: 'success', tagRemoved: outcome.tagId, groupId: outcome.groupId,
      }));
      publishTo(server, ADMIN_TOPIC, sessionClosed(outcome.sessionId, outcome.groupId));
      publishTo(server, ADMIN_TOPIC, groupUpdated(outcome.view, now));
      return { data: { sessionId: outcome.sessionId, status: 'closed', receipt: outcome.receipt } };
    }, {
      body: t.Object({ staffId: t.String({ minLength: 1 }), amount: t.Integer({ minimum: 0 }), customerConfirmed: t.Boolean() }),
    })

    .post('/api/v1/groups/:groupId/check-out', async ({ request, params, body, set, server }) => {
      const staffId = staffIdFrom(request, config);
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
      const now = Date.now();

      const outcome = await repo.transaction(async (tx) => {
        const view = await tx.lockGroup(params.groupId);
        if (!view || view.group.status === 'closed') return { kind: 'not_found' as const };
        const members = view.members.filter((member) => member.session.status === 'open');
        if (!members.length) return { kind: 'not_found' as const };
        const amount = members.reduce((total, member) => total + sessionAmountSatang(member.session, now), 0);
        if (body.amount !== amount) return { kind: 'mismatch' as const, amount };

        const checkOutTime = new Date(now).toISOString();
        const { closed } = await tx.closeGroup(params.groupId, checkOutTime);
        // Each member's receipt carries that member's own priced time, so the sum of receipts is the
        // money actually taken (and `GET /groups` can report `billedSatang` without a second ledger).
        for (const member of closed) {
          await tx.saveReceipt(member.session.sessionId, {
            amount: sessionAmountSatang(member.session, now),
            ratePerHour: RATE_PER_HOUR_SATANG,
            staffId,
            confirmedAt: checkOutTime,
            billVersion: 'rate-v1',
          });
        }
        await tx.appendAudit({
          actor: staffId, tagId: null, action: 'check-out.group',
          endpoint: `/api/v1/groups/${params.groupId}/check-out`, result: 'success',
        });
        // §3.2 — whole group paid: the reader shows the total, once, on whichever transport is live.
        await tx.saveReaderOutcome({
          groupId: params.groupId,
          payload: { screen: 'success', bill: { amount, ratePerHour: RATE_PER_HOUR_SATANG } },
        });
        const updated = (await tx.groupView(params.groupId))!;
        return { kind: 'ok' as const, amount, groupId: params.groupId, checkOutTime, closed, view: updated };
      });

      if (outcome.kind === 'not_found') {
        set.status = 404;
        return errorBody('GROUP_NOT_FOUND', 'Active group was not found');
      }
      if (outcome.kind === 'mismatch') {
        set.status = 409;
        return errorBody('BILL_AMOUNT_MISMATCH', 'Confirmed amount does not match the current bill', {
          amount: outcome.amount, ratePerHour: RATE_PER_HOUR_SATANG,
        });
      }

      const receipt = {
        amount: outcome.amount, ratePerHour: RATE_PER_HOUR_SATANG, staffId,
        confirmedAt: outcome.checkOutTime, billVersion: 'rate-v1',
      };
      publishTo(server, READER_TOPIC, readerScreen({
        screen: 'success', bill: { amount: outcome.amount, ratePerHour: RATE_PER_HOUR_SATANG }, groupId: outcome.groupId,
      }));
      for (const member of outcome.closed) publishTo(server, ADMIN_TOPIC, sessionClosed(member.session.sessionId, outcome.groupId));
      publishTo(server, ADMIN_TOPIC, groupUpdated(outcome.view, now));
      return { data: { groupId: outcome.groupId, status: 'closed', receipt } };
    }, {
      body: t.Object({ staffId: t.String({ minLength: 1 }), amount: t.Integer({ minimum: 0 }), customerConfirmed: t.Boolean() }),
    })

    // -------------------------------------------------------------------------------------
    // Compliance log (CCA §26) — staff/admin only, and viewing it is itself logged
    // -------------------------------------------------------------------------------------
    .get('/api/v1/audit-logs', async ({ request, set }) => {
      const staffId = staffIdFrom(request, config);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      const entries = await repo.transaction(async (tx) => {
        await tx.appendAudit({ actor: staffId, tagId: null, action: 'audit.view', endpoint: '/api/v1/audit-logs', result: 'success' });
        return tx.listAudits();
      });
      return { data: entries.filter((entry) => entry.action !== 'audit.view') };
    })

    // -------------------------------------------------------------------------------------
    // Development only: reset the in-memory demo (never the audit log)
    // -------------------------------------------------------------------------------------
    .post('/api/v1/demo/reset', async ({ request, set }) => {
      const staffId = staffIdFrom(request, config);
      if (!staffId) {
        set.status = 401;
        return errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required');
      }
      const auditsRetained = await repo.transaction(async (tx) => (await tx.listAudits()).length);
      await repo.reset();
      await repo.transaction((tx) => tx.appendAudit({
        actor: staffId, tagId: null, action: 'demo.reset', endpoint: '/api/v1/demo/reset', result: 'success',
      }));
      return { data: { status: 'reset', auditsRetained } };
    })

    // -------------------------------------------------------------------------------------
    // WebSocket — §3.2 `WSS /ws/reader` (scoped to the group screen) and §4.2 `WSS /ws/admin`
    // -------------------------------------------------------------------------------------
    .ws('/ws/reader', {
      open(ws: any) {
        if (!deviceAuthorized(ws.data.request, queryParam(ws.data, 'deviceKey'), config)) {
          ws.send(JSON.stringify(errorBody('DEVICE_UNAUTHORIZED', 'Reader authentication required')));
          ws.close();
          return;
        }
        ws.subscribe(READER_TOPIC);
      },
      message(ws: any) {
        // The reader is a dumb display (§3.2): it has nothing to say on this channel.
        ws.send(JSON.stringify(errorBody('VALIDATION_ERROR', 'The reader channel is push-only')));
      },
      close(ws: any) {
        ws.unsubscribe(READER_TOPIC);
      },
    })
    .ws('/ws/admin', {
      open(ws: any) {
        if (!staffIdFromRequestOrQuery(ws.data.request, queryParam(ws.data, 'token'), config)) {
          ws.send(JSON.stringify(errorBody('STAFF_UNAUTHORIZED', 'Staff authentication required')));
          ws.close();
          return;
        }
        ws.subscribe(ADMIN_TOPIC);
      },
      message(ws: any) {
        // Events are server-initiated (§4.2); the staff web app reads over REST.
        ws.send(JSON.stringify(errorBody('VALIDATION_ERROR', 'The admin channel is push-only')));
      },
      close(ws: any) {
        ws.unsubscribe(ADMIN_TOPIC);
      },
    });
}
