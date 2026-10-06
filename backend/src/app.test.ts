import { afterAll, describe, expect, it } from 'bun:test';
import postgres from 'postgres';
import { createApp } from './app';
import { type Config, loadConfig } from './config';
import { connectionOptions } from './db/connect';
import { hashTagUid, moneyForDurationMs } from './domain';
import type { Repository } from './repository';
import { MemoryStore } from './stores/memory-store';

/**
 * The same suite runs against both stores.
 *
 *   bun test                      → in-memory store (no database, no credentials)
 *   DATABASE_URL=… bun test       → PostgreSQL store, each test starting from a clean schema
 *
 * That equivalence is the point of the repository seam: if the two paths ever disagree, one of them
 * fails here rather than in a demo.
 */
const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const PEPPER = (process.env.TAG_UID_PEPPER ?? '').trim() || 'integration-test-pepper';
/**
 * Postgres mode reads the whole environment (so `DATABASE_PASSWORD` travels with `DATABASE_URL`);
 * without a database URL the suite runs on the in-memory store and needs nothing at all.
 */
const config: Config = DATABASE_URL
  ? loadConfig({ ...process.env, TAG_UID_PEPPER: PEPPER })
  : loadConfig({} as NodeJS.ProcessEnv);
const RATE_SATANG = 3000;

let pgSql: ReturnType<typeof postgres> | null = null;
let sharedRepo: Repository | null = null;

async function cleanPostgres() {
  pgSql ??= postgres(DATABASE_URL, connectionOptions(DATABASE_URL));
  await pgSql`truncate receipts, sessions, groups, scan_dedupe, audit_log, tags cascade`;
  await pgSql`delete from reader_outcome`;
  await pgSql`update reader_state set open_group_id = null, open_until = null where id = true`;
}

/** A clean repository per test: a fresh MemoryStore, or the shared Postgres pool with a wiped schema. */
async function testRepo(): Promise<Repository> {
  if (!DATABASE_URL) return new MemoryStore();
  await cleanPostgres();
  if (!sharedRepo) {
    const { PostgresRepository } = await import('./stores/postgres-store');
    sharedRepo = await PostgresRepository.connect(config);
  }
  return sharedRepo;
}

afterAll(async () => {
  if (sharedRepo?.close) await sharedRepo.close();
  if (pgSql) await pgSql.end();
});

const deviceHeaders = { 'x-device-key': config.deviceKey, 'content-type': 'application/json' };
const staffHeaders = { authorization: `Bearer ${config.staffToken}`, 'content-type': 'application/json' };

async function json(response: Response) {
  return response.json() as Promise<any>;
}

/** Poll until `check()` is true or the budget runs out — WS delivery is asynchronous by nature. */
async function waitFor(check: () => boolean, budgetMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}

/** A socket that records every JSON message it receives. */
function openSocket(url: string) {
  const socket = new WebSocket(url);
  const messages: any[] = [];
  socket.addEventListener('message', (event) => {
    try {
      messages.push(JSON.parse(String((event as MessageEvent).data)));
    } catch {
      messages.push(String((event as MessageEvent).data));
    }
  });
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error(`could not open ${url}`)));
    socket.addEventListener('close', () => resolve());
  });
  return { socket, messages, opened };
}

async function makeApp() {
  return createApp({ repo: await testRepo(), config });
}

/** Start a real listener on an ephemeral port — WebSocket needs an actual server, not `handle()`. */
async function listen() {
  const repo = await testRepo();
  const app = createApp({ repo, config });
  app.listen({ port: 0 });
  const port = (app.server as any).port as number;
  return { app, repo, port, base: `http://localhost:${port}` };
}

// ---------------------------------------------------------------------------------------------
// Helpers shared by the flow tests: drive the API the way a reader and a staff client would.
// ---------------------------------------------------------------------------------------------

async function registerCards(app: any, cards: string[]) {
  for (const rawTagUid of cards) {
    await app.handle(new Request('http://localhost/api/v1/nfc-tags', {
      method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid, label: rawTagUid }),
    }));
  }
}

function scan(app: any, rawTagUid: string) {
  return app.handle(new Request('http://localhost/api/v1/scans', {
    method: 'POST', headers: deviceHeaders, body: JSON.stringify({ rawTagUid }),
  }));
}

function groups(app: any, query = '?status=active') {
  return app.handle(new Request(`http://localhost/api/v1/groups${query}`, { headers: staffHeaders }));
}

/**
 * Confirm a check-out the way a client must.
 *
 * The bill is priced from the backend's clock, so a figure read a moment earlier can be one rounding
 * tick stale; the backend answers `BILL_AMOUNT_MISMATCH` with the amount to confirm and the client
 * re-confirms with exactly that (the demo does the same, up to three attempts). Against a cloud
 * database this is the normal path, not an error — which is why the tests drive it too instead of
 * assuming the first POST lands.
 */
async function confirm(app: any, path: string, body: Record<string, unknown>, attempts = 3) {
  let response = await app.handle(new Request(`http://localhost${path}`, {
    method: 'POST', headers: staffHeaders, body: JSON.stringify(body),
  }));
  for (let attempt = 1; attempt < attempts && response.status === 409; attempt += 1) {
    const payload = await response.clone().json() as any;
    const amount = payload?.error?.details?.amount;
    if (amount === undefined) break;
    response = await app.handle(new Request(`http://localhost${path}`, {
      method: 'POST', headers: staffHeaders, body: JSON.stringify({ ...body, amount }),
    }));
  }
  return response;
}

/** The same, for the tests that talk to a real listener over HTTP. */
async function confirmFetch(base: string, path: string, body: Record<string, unknown>, attempts = 3) {
  let response = await fetch(base + path, { method: 'POST', headers: staffHeaders, body: JSON.stringify(body) });
  for (let attempt = 1; attempt < attempts && response.status === 409; attempt += 1) {
    const payload = await response.clone().json() as any;
    const amount = payload?.error?.details?.amount;
    if (amount === undefined) break;
    response = await fetch(base + path, { method: 'POST', headers: staffHeaders, body: JSON.stringify({ ...body, amount }) });
  }
  return response;
}

describe('backend MVP', () => {
  it('registers an opaque tag and never creates a second session for a repeated tap', async () => {
    const app = await makeApp();
    const registered = await app.handle(new Request('http://localhost/api/v1/nfc-tags', {
      method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid: '04A3B2C1D4', label: 'Demo A' }),
    }));
    expect(registered.status).toBe(201);
    const tag = await json(registered);
    expect(tag.data.tagId).toBeString();
    expect(JSON.stringify(tag)).not.toContain('04A3B2C1D4');   // PDPA: the raw UID never comes back

    const first = await scan(app, '04A3B2C1D4');
    expect(first.status).toBe(200);
    const firstBody = await json(first);
    expect(firstBody.data.screen).toBe('waiting');

    // A repeat tap resolves to a non-creating outcome — the dedupe window's replay or "already checked
    // in". Which of the two depends on wall-clock timing, so assert the property that matters: the same
    // card is still one member of one group.
    const again = await json(await scan(app, '04A3B2C1D4'));
    expect(['waiting', 'group']).toContain(again.data.screen);
    expect(again.data.groupId).toBe(firstBody.data.groupId);
    const list = await json(await groups(app));
    expect(list.data).toHaveLength(1);
    expect(list.data[0].tags).toHaveLength(1);
  });

  it('replays a retried tap inside the dedupe window and forgets it after', async () => {
    // The window itself, without racing the clock (`api-convention.md` §10).
    const repo = await testRepo();
    const now = Date.now();
    const response = { data: { screen: 'waiting', groupId: 'grp_replay' } };
    await repo.transaction((tx) => tx.rememberScan('dedupe-hash', now, response));

    const inside = await repo.transaction((tx) => tx.recentScan('dedupe-hash', now + 1_500));
    expect((inside?.response as any)?.data?.groupId).toBe('grp_replay');
    const after = await repo.transaction((tx) => tx.recentScan('dedupe-hash', now + 5_000));
    expect(after).toBeNull();
  });

  it('stores only a peppered HMAC of the UID, never a bare hash', async () => {
    // A low-entropy UID hashed with plain sha256 is enumerable back to the card, so the stored value
    // must depend on a server-side pepper. This is the guard for that decision.
    const raw = '04A3B2C1D4';
    const peppered = hashTagUid(raw, config.tagUidPepper);
    expect(peppered).toHaveLength(64);
    expect(peppered).not.toBe(hashTagUid(raw, 'a-different-pepper'));
    expect(peppered).toBe(hashTagUid(` ${raw.toLowerCase()} `, config.tagUidPepper)); // normalised
    const bareSha256 = new Bun.CryptoHasher('sha256').update(raw.trim().toUpperCase()).digest('hex');
    expect(peppered).not.toBe(bareSha256);
  });

  it('joins a second tag and rejects checkout without explicit confirmation', async () => {
    const app = await makeApp();
    await registerCards(app, ['A', 'B']);

    const first = await json(await scan(app, 'A'));
    const second = await json(await scan(app, 'B'));
    expect(first.data.screen).toBe('waiting');
    expect(second.data.screen).toBe('joined');
    expect(second.data.tags).toHaveLength(2);

    const groupsBody = await json(await groups(app));
    const sessionId = groupsBody.data[0].tags[0].sessionId;
    const response = await app.handle(new Request(`http://localhost/api/v1/sessions/${sessionId}/check-out`, {
      method: 'POST', headers: staffHeaders, body: JSON.stringify({ staffId: config.staffId, amount: 0, customerConfirmed: false }),
    }));
    expect(response.status).toBe(400);
    expect((await json(response)).error.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('re-registering the same raw UID keeps the existing tag identity', async () => {
    const app = await makeApp();
    const register = () => app.handle(new Request('http://localhost/api/v1/nfc-tags', {
      method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid: 'AA', label: 'Card A' }),
    }));
    const first = await json(await register());
    const second = await json(await register());
    expect(second.data.tagId).toBe(first.data.tagId);

    // …and the identity still drives the same card after a demo reset.
    await scan(app, 'AA');
    await app.handle(new Request('http://localhost/api/v1/demo/reset', { method: 'POST', headers: staffHeaders }));
    const afterReset = await json(await scan(app, 'AA'));
    expect(afterReset.data.screen).toBe('waiting');
    expect(afterReset.data.tagId).toBe(first.data.tagId);
  });

  it('prices every bill at ฿30/hour in whole started minutes', async () => {
    expect(moneyForDurationMs(3_600_000)).toBe(RATE_SATANG);
    expect(moneyForDurationMs(0)).toBe(0);
    expect(moneyForDurationMs(42 * 60_000)).toBe(2100);   // ฿21.00 for 42 minutes
    // Every started minute counts — the gate is the minute boundary, not the satang.
    expect(moneyForDurationMs(1)).toBe(50);
    expect(moneyForDurationMs(60_000)).toBe(50);
    expect(moneyForDurationMs(60_001)).toBe(100);

    const app = await makeApp();
    await registerCards(app, ['A']);
    await scan(app, 'A');
    const before = Date.now();
    const groupsBody = await json(await groups(app));
    const after = Date.now();
    const member = groupsBody.data[0].tags[0];

    // The reported amount is the ฿30/hour rule applied to the *server's* clock, which lies inside the
    // window this test measured around its request — a client cannot pin it to a single instant, and
    // asserting otherwise only tests the network's latency.
    const checkIn = Date.parse(member.checkInTime);
    expect(member.amountSatang).toBeGreaterThanOrEqual(moneyForDurationMs(before - checkIn));
    expect(member.amountSatang).toBeLessThanOrEqual(moneyForDurationMs(after - checkIn));
    expect(groupsBody.data[0].amountSatang).toBe(member.amountSatang);
    expect(groupsBody.reader.currentBillSatang).toBe(member.amountSatang);
    expect(groupsBody.reader.openGroupId).toBe(groupsBody.data[0].groupId);
  });

  it('tells a client the exact figure when its confirmed amount is stale', async () => {
    const app = await makeApp();
    await registerCards(app, ['A']);
    await scan(app, 'A');
    const { data } = await json(await groups(app));
    const member = data[0].tags[0];

    const mismatch = await app.handle(new Request(`http://localhost/api/v1/sessions/${member.sessionId}/check-out`, {
      method: 'POST', headers: staffHeaders, body: JSON.stringify({ staffId: config.staffId, amount: 999_999, customerConfirmed: true }),
    }));
    expect(mismatch.status).toBe(409);
    const body = await json(mismatch);
    expect(body.error.code).toBe('BILL_AMOUNT_MISMATCH');
    expect(body.error.details.amount).toBeNumber();

    const ok = await confirm(app, `/api/v1/sessions/${member.sessionId}/check-out`, {
      staffId: config.staffId, amount: body.error.details.amount, customerConfirmed: true,
    });
    expect(ok.status).toBe(200);
    expect((await json(ok)).data.status).toBe('closed');
  });

  it('resets operational data but keeps the audit log and the tag identities', async () => {
    const app = await makeApp();
    await registerCards(app, ['A']);
    await scan(app, 'A');
    expect((await json(await groups(app))).data).toHaveLength(1);

    const reset = await app.handle(new Request('http://localhost/api/v1/demo/reset', { method: 'POST', headers: staffHeaders }));
    expect(reset.status).toBe(200);
    expect((await json(await groups(app, ''))).data).toHaveLength(0);

    // CCA §26 retention: the log survives, and the reset itself is recorded.
    const audits = await json(await app.handle(new Request('http://localhost/api/v1/audit-logs', { headers: staffHeaders })));
    expect(audits.data.some((entry: any) => entry.action === 'tag.register')).toBe(true);
    expect(audits.data.some((entry: any) => entry.action === 'demo.reset')).toBe(true);
  });

  it('requires credentials on both sides', async () => {
    const app = await makeApp();
    expect((await app.handle(new Request('http://localhost/api/v1/groups'))).status).toBe(401);
    const badDevice = await app.handle(new Request('http://localhost/api/v1/scans', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-device-key': 'nope' }, body: JSON.stringify({ rawTagUid: 'A' }),
    }));
    expect(badDevice.status).toBe(401);
  });

  it('allows the browser demo origin through CORS, but never with credentials', async () => {
    const app = await makeApp();
    const preflight = await app.handle(new Request('http://localhost/api/v1/scans', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:8080',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-device-key,content-type',
      },
    }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('x-device-key');
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();
  });
});

describe('realtime channels (api-contract §3.2 / §4.2)', () => {
  it('rejects an unauthenticated reader socket and accepts an authenticated one', async () => {
    const { app, port } = await listen();
    const bad = openSocket(`ws://localhost:${port}/ws/reader`);
    await bad.opened;
    await waitFor(() => bad.messages.length > 0);
    expect(bad.messages[0].error.code).toBe('DEVICE_UNAUTHORIZED');
    bad.socket.close();

    const good = openSocket(`ws://localhost:${port}/ws/reader?deviceKey=${config.deviceKey}`);
    await good.opened;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(good.socket.readyState).toBe(WebSocket.OPEN);
    good.socket.close();
    app.stop();
  });

  it('pushes scan.activity and group.updated to the staff channel on a tap', async () => {
    const { app, base, port } = await listen();
    const admin = openSocket(`ws://localhost:${port}/ws/admin?token=${config.staffToken}`);
    await admin.opened;

    await fetch(`${base}/api/v1/nfc-tags`, { method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid: 'A', label: 'Card A' }) });
    const scanResult = await json(await fetch(`${base}/api/v1/scans`, { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ rawTagUid: 'A' }) }));
    expect(scanResult.data.screen).toBe('waiting');

    await waitFor(() => admin.messages.length >= 2);
    const activity = admin.messages.find((m) => m.event === 'scan.activity');
    const updated = admin.messages.find((m) => m.event === 'group.updated');
    expect(activity.data.groupId).toBe(scanResult.data.groupId);
    expect(activity.data.scanningTagId).toBe(scanResult.data.tagId);
    expect(activity.data.sessionId).toBeString();
    expect(updated.data.groupId).toBe(scanResult.data.groupId);
    expect(updated.data.status).toBe('active');
    expect(updated.data.tags[0].tagId).toBe(scanResult.data.tagId);
    expect(Date.parse(activity.ts)).toBeNumber();

    admin.socket.close();
    app.stop();
  });

  it('pushes a success screen to the reader and session.closed to staff on group check-out', async () => {
    const { app, base, port } = await listen();
    const reader = openSocket(`ws://localhost:${port}/ws/reader?deviceKey=${config.deviceKey}`);
    const admin = openSocket(`ws://localhost:${port}/ws/admin?token=${config.staffToken}`);
    await Promise.all([reader.opened, admin.opened]);

    for (const card of ['A', 'B']) {
      await fetch(`${base}/api/v1/nfc-tags`, { method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid: card, label: card }) });
      await fetch(`${base}/api/v1/scans`, { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ rawTagUid: card }) });
    }

    const groupList = await json(await fetch(`${base}/api/v1/groups?status=active`, { headers: staffHeaders }));
    const group = groupList.data[0];
    expect(group.tags).toHaveLength(2);

    const checkout = await confirmFetch(base, `/api/v1/groups/${group.groupId}/check-out`, {
      staffId: config.staffId, amount: group.amountSatang, customerConfirmed: true,
    });
    expect(checkout.status).toBe(200);
    const charged = (await json(checkout)).data.receipt.amount;

    await waitFor(() => reader.messages.length > 0 && admin.messages.filter((m) => m.event === 'session.closed').length === 2);
    const push = reader.messages[0];
    expect(push.data.screen).toBe('success');
    // The reader is told exactly what was charged — not the preview this test read a moment earlier.
    expect(push.data.bill.amount).toBe(charged);
    expect(push.data.bill.ratePerHour).toBe(RATE_SATANG);
    expect(push.data.groupId).toBe(group.groupId);

    const closed = admin.messages.filter((m) => m.event === 'session.closed');
    expect(closed.map((m) => m.data.sessionId).sort()).toEqual(group.tags.map((t: any) => t.sessionId).sort());
    expect(admin.messages.some((m) => m.event === 'group.updated' && m.data.status === 'closed')).toBe(true);

    reader.socket.close();
    admin.socket.close();
    app.stop();
  });

  it('pushes tagRemoved to the reader for an individual check-out', async () => {
    const { app, base, port } = await listen();
    const reader = openSocket(`ws://localhost:${port}/ws/reader?deviceKey=${config.deviceKey}`);
    await reader.opened;

    for (const card of ['A', 'B']) {
      await fetch(`${base}/api/v1/nfc-tags`, { method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid: card, label: card }) });
      await fetch(`${base}/api/v1/scans`, { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ rawTagUid: card }) });
    }
    const groupList = await json(await fetch(`${base}/api/v1/groups?status=active`, { headers: staffHeaders }));
    const member = groupList.data[0].tags[0];

    const checkout = await confirmFetch(base, `/api/v1/sessions/${member.sessionId}/check-out`, {
      staffId: config.staffId, amount: member.amountSatang, customerConfirmed: true,
    });
    expect(checkout.status).toBe(200);
    const charged = (await json(checkout)).data.receipt.amount;

    await waitFor(() => reader.messages.length > 0);
    expect(reader.messages[0].data.screen).toBe('success');
    expect(reader.messages[0].data.tagRemoved).toBe(member.tagId);
    expect(reader.messages[0].data.bill).toBeUndefined();

    const stillActive = await json(await fetch(`${base}/api/v1/groups?status=active`, { headers: staffHeaders }));
    expect(stillActive.data[0].tags).toHaveLength(1);
    expect(stillActive.reader.billedSatang).toBe(charged);

    reader.socket.close();
    app.stop();
  });

  it('serves the same outcome over the polling fallback, exactly once', async () => {
    const { app, base } = await listen();
    await fetch(`${base}/api/v1/nfc-tags`, { method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid: 'A' }) });
    await fetch(`${base}/api/v1/scans`, { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ rawTagUid: 'A' }) });
    const groupList = await json(await fetch(`${base}/api/v1/groups?status=active`, { headers: staffHeaders }));
    const group = groupList.data[0];

    const nothingPending = await fetch(`${base}/api/v1/reader/state`, { headers: deviceHeaders });
    expect(nothingPending.status).toBe(204);

    const checkout = await confirmFetch(base, `/api/v1/groups/${group.groupId}/check-out`, {
      staffId: config.staffId, amount: group.amountSatang, customerConfirmed: true,
    });
    expect(checkout.status).toBe(200);
    const charged = (await json(checkout)).data.receipt.amount;

    const pushed = await fetch(`${base}/api/v1/reader/state`, { headers: deviceHeaders });
    expect(pushed.status).toBe(200);
    const body = await json(pushed);
    expect(body.data.screen).toBe('success');
    expect(body.data.bill.amount).toBe(charged);

    const again = await fetch(`${base}/api/v1/reader/state`, { headers: deviceHeaders });
    expect(again.status).toBe(204);

    const unauthorized = await fetch(`${base}/api/v1/reader/state`);
    expect(unauthorized.status).toBe(401);

    app.stop();
  });
});

describe('configuration', () => {
  it('takes the database password as its own value and percent-encodes it', () => {
    const base = { STORE: 'postgres', TAG_UID_PEPPER: 'private' } as NodeJS.ProcessEnv;
    const resolved = loadConfig({
      ...base,
      DATABASE_URL: 'postgresql://postgres.ref:[YOUR-PASSWORD]@host:5432/postgres',
      DATABASE_PASSWORD: 'p@ss word/1',
    });
    expect(resolved.databaseUrl).toBe('postgresql://postgres.ref:p%40ss%20word%2F1@host:5432/postgres');

    // Quotes from other .env habits, and Prisma-only query parameters, are absorbed.
    const quoted = loadConfig({ ...base, DATABASE_URL: '"postgresql://u:pw@host:6543/postgres?pgbouncer=true"' });
    expect(quoted.databaseUrl).toBe('postgresql://u:pw@host:6543/postgres');

    // An unresolved placeholder is an explicit, actionable error rather than a connection timeout.
    expect(() => loadConfig({ ...base, DATABASE_URL: 'postgresql://postgres.ref:[YOUR-PASSWORD]@host:5432/postgres' }))
      .toThrow(/DATABASE_PASSWORD/);
  });

  it('refuses to run against a database with the public development pepper', () => {
    expect(() => loadConfig({ STORE: 'postgres', DATABASE_URL: 'postgresql://x' } as NodeJS.ProcessEnv))
      .toThrow(/TAG_UID_PEPPER/);
    expect(() => loadConfig({ STORE: 'postgres', TAG_UID_PEPPER: 'private' } as NodeJS.ProcessEnv))
      .toThrow(/DATABASE_URL/);
    const ok = loadConfig({ STORE: 'postgres', DATABASE_URL: 'postgresql://x', TAG_UID_PEPPER: 'private' } as NodeJS.ProcessEnv);
    expect(ok.store).toBe('postgres');
  });

  it('defaults to the in-memory store with no environment at all', () => {
    const defaults = loadConfig({} as NodeJS.ProcessEnv);
    expect(defaults.store).toBe('memory');
    expect(defaults.deviceKey).toBe('dev-device-key');
    expect(defaults.staffToken).toBe('dev-staff-token');
  });
});
