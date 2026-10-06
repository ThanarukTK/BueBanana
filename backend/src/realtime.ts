/**
 * Realtime layer — the two WebSocket channels of `docs/api-contract.md` (§3.2 reader, §4.2 admin)
 * plus the payload shapes they carry.
 *
 * Both channels reuse the app's plain JSON envelopes: a reader push is `{ data: { screen } }` and an
 * admin event is `{ event, data, ts }` — exactly what the contract spells out, so firmware and the
 * staff web app can parse either without a special case.
 */

import { type GroupView, groupResponse } from './domain';

/** One shared reader for the whole café, so a single reader topic is enough (§1). */
export const READER_TOPIC = 'reader';
/** One topic for the staff view; role filtering happens at connect time (§4.2). */
export const ADMIN_TOPIC = 'admin';

type ServerLike = { publish?: (topic: string, data: string) => void } | null | undefined;

/**
 * Publish to a topic if there is a server to publish on. Route handlers also run through
 * `app.handle()` in tests, where no Bun server exists, and a channel with no subscribers is a no-op
 * in Bun anyway — so this never fails a request because nobody was listening.
 */
export function publishTo(server: ServerLike, topic: string, payload: unknown): void {
  try {
    server?.publish?.(topic, JSON.stringify(payload));
  } catch {
    /* no server (handle()) or no subscribers — a missed push is not a failed request */
  }
}

/** §3.2 — reader messages carry no `event` wrapper; `data.screen` is the firmware's whole vocabulary. */
export function readerScreen(data: Record<string, unknown>): { data: Record<string, unknown> } {
  return { data };
}

/** §4.2 — admin events are tagged so the staff app can tell them apart. */
export function adminEvent(event: string, data: Record<string, unknown>): {
  event: string;
  data: Record<string, unknown>;
  ts: string;
} {
  return { event, data, ts: new Date().toISOString() };
}

/**
 * §4.2 `scan.activity` — fires the instant a tap resolves.
 *
 * `sessionId` is an additive optional field (§3.4 allows additions in `/api/v1`): without it the
 * staff app must re-fetch and guess which member of the roster is scanning, and PB-14 is exactly
 * "show who is scanning" before charging.
 */
export function scanActivity(groupId: string, scanningTagId: string, sessionId: string) {
  return adminEvent('scan.activity', { groupId, scanningTagId, sessionId });
}

/** §4.2 `group.updated` — `data` is a full `Group` object (§2), roster included. */
export function groupUpdated(view: GroupView, now = Date.now()) {
  return adminEvent('group.updated', groupResponse(view.group, view.members, now) as unknown as Record<string, unknown>);
}

/** §4.2 `session.closed` — fires once, per session, individually or as part of a group check-out. */
export function sessionClosed(sessionId: string, groupId: string) {
  return adminEvent('session.closed', { sessionId, groupId });
}
