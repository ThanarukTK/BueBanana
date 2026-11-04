import { createHash } from 'node:crypto';

export const RATE_PER_HOUR_SATANG = 3000;
/** ฿30/hour in whole-hour blocks. */
export const HOUR_MS = 3_600_000;
/**
 * ฿150 cap per person = hour 5. Model: `bill = min(ceil(hours) × RATE, ALL_DAY)`.
 * No separate entry fee — billing starts at hour 1 (฿30) and ends at hour 5 (฿150),
 * after which nobody pays more no matter how long they stay.
 */
export const ALL_DAY_SATANG = 15000;
/**
 * Billing model (no entry fee, pure hourly with an all-day cap):
 *   bill = min(ceil(hours) × RATE, ALL_DAY)
 * whole-hour blocks (a 42-minute visit bills as 1 hour = ฿30), no charge for a zero-duration
 * session, and the ฿150 cap means hour 5 is the maximum anyone pays (฿30×5 = ฿150), regardless
 * of how much longer the party stays.
 */
/** Kept for backward compatibility with the wire contract; the UI derives its copy from these. */
export const RATE_PER_MINUTE_SATANG = RATE_PER_HOUR_SATANG / 60;
export const JOIN_WINDOW_MS = 30_000;
export const IDEMPOTENCY_WINDOW_MS = 2_000;

export type Tag = {
  tagId: string;
  uidHash: string;
  label: string | null;
  status: 'active' | 'disabled';
};

export type Session = {
  sessionId: string;
  tagId: string;
  groupId: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'open' | 'closed';
};

export type Group = {
  groupId: string;
  status: 'active' | 'closed';
  startTime: string;
  sessionIds: string[];
};

export type AuditEntry = {
  auditId: string;
  actor: string;
  tagId: string | null;
  action: string;
  endpoint: string;
  timestamp: string;
  result: 'success' | 'failure';
};

export type CheckoutReceipt = {
  amount: number;
  ratePerHour: number;
  staffId: string;
  confirmedAt: string;
  billVersion: string;
};

/** A member joined with their tag — everything one roster row needs. */
export type RosterMember = { tag: Tag; session: Session };

/** A `Group` plus its roster: the §2 projection the staff view and the reader receive. */
export type GroupView = { group: Group; members: RosterMember[] };

/**
 * Internal identifier for a physical card: SHA-256 of the normalised raw UID.
 *
 * NOTE: this used to be HMAC-SHA256 keyed by a server-side pepper (`TAG_UID_PEPPER`) so the
 * low-entropy UID hash could not be enumerated back to the physical card (PDPA minimisation,
 * rule.md). The pepper was removed at the owner's request — the hash is now a bare sha256, which
 * anyone with the table can reverse for a given card. The DB was wiped in the same change, so old
 * peppered hashes do not collide. Restore the pepper (and re-key) if this is a compliance concern:
 * the earlier code is in git history.
 */
export function hashTagUid(rawTagUid: string): string {
  return createHash('sha256').update(rawTagUid.trim().toUpperCase()).digest('hex');
}

/**
 * Bill for a duration, in satang: **hourly only, no entry fee** — ฿30/hour in whole-hour
 * blocks, capped at ฿150 (hour 5) per person.
 *
 *   bill = min(ceil(duration / HOUR_MS) × RATE_PER_HOUR_SATANG, ALL_DAY_SATANG)
 *
 * A zero-duration session bills **0** (nothing elapsed, nothing owed). Any time at all rounds
 * up to a whole hour block, so a 42-minute visit bills ฿30 (1 hour). The cap is what keeps a
 * long session affordable: hour 5 is ฿30×5 = ฿150, and no amount of extra time raises it.
 */
export function moneyForDurationMs(durationMs: number): number {
  const elapsed = Math.max(0, durationMs);
  if (elapsed === 0) return 0; // never played → nothing owed
  const hours = Math.ceil(elapsed / HOUR_MS);
  return Math.min(hours * RATE_PER_HOUR_SATANG, ALL_DAY_SATANG);
}

/** Bill for one session, priced server-side from the stored check-in time (never from a posted amount). */
export function sessionAmountSatang(session: Session, now = Date.now()): number {
  const end = session.checkOutTime ? Date.parse(session.checkOutTime) : now;
  return moneyForDurationMs(end - Date.parse(session.checkInTime));
}

/** Friendly placement/table names, picked (stably) per group for the staff view. */
export const GROUP_NAMES = [
  'Banana Bay',
  'Catan Cove',
  'Scrabble Street',
  'Jenga Plaza',
  'Uno Sunset',
  'Monopoly Manor',
  'Dice Dock',
  'Domino Den',
  'Puzzle Pier',
  'Checker Corner',
  'Ludo Lounge',
  'Rummy River',
  'Bingo Bay',
  'Cluedo Corner',
  'Mahjong Meadow',
  'Meeple Meeting',
  'Poker Palm',
  'Card Corner',
  'Treasure Table',
  'Joker Junction',
] as const;

/**
 * Pick a friendly name for a group. Deterministic on the groupId (same group always same
 * friendly name), so it needs no database column and works in-memory and on Postgres alike.
 */
export function friendlyGroupName(groupId: string): string {
  let h = 0;
  for (let i = 0; i < groupId.length; i++) {
    h = (h * 31 + groupId.charCodeAt(i)) >>> 0;
  }
  return GROUP_NAMES[h % GROUP_NAMES.length];
}

/**
 * Staff-facing `Group` projection (`docs/api-contract.md` §2).
 *
 * `sessionId` and `amountSatang` are additive optional fields, which §3.4 explicitly allows inside
 * `/api/v1` (add only, never remove/rename). They exist so a staff client can address one member's
 * check-out and show the exact amount the backend will accept, instead of re-deriving the bill
 * itself and risking a `BILL_AMOUNT_MISMATCH` on a rounding difference.
 *
 * `name` (the friendly placement name) is likewise additive for display.
 */
export function groupResponse(group: Group, members: RosterMember[], now = Date.now()) {
  const open = members.filter((member) => member.session.status === 'open');
  const entries = open.map((member) => ({
    tagId: member.tag.tagId,
    label: member.tag.label,
    checkInTime: member.session.checkInTime,
    sessionId: member.session.sessionId,
    amountSatang: sessionAmountSatang(member.session, now),
  }));
  return {
    groupId: group.groupId,
    name: friendlyGroupName(group.groupId),
    status: group.status,
    startTime: group.startTime,
    tags: entries,
    amountSatang: entries.reduce((total, entry) => total + entry.amountSatang, 0),
  };
}
