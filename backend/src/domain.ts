import { createHmac } from 'node:crypto';

export const RATE_PER_HOUR_SATANG = 3000;
/**
 * ฿30/hour is ฿0.50 per minute. Billing is done in whole **started** minutes (see
 * `moneyForDurationMs`), so this is the figure the backend actually steps in.
 */
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
 * Internal identifier for a physical card: HMAC-SHA256 of the normalised raw UID, keyed by a
 * server-side pepper (`TAG_UID_PEPPER`).
 *
 * Why not a plain `sha256(rawUid)`: an NFC UID is a handful of bytes, so its hash space is small enough
 * to enumerate — a bare hash would let anyone holding the table map every row back to the physical card
 * it identifies, which is exactly the personal-data link PDPA asks us to minimise. The pepper never
 * leaves the backend (`docs/rule.md`, `docs/api-convention.md` §7).
 */
export function hashTagUid(rawTagUid: string, pepper: string): string {
  return createHmac('sha256', pepper).update(rawTagUid.trim().toUpperCase()).digest('hex');
}

/**
 * Bill for a duration, in satang: **฿30/hour billed per started minute** (฿0.50 each), no minimum.
 *
 * Per-minute rather than continuous rounding is deliberate. A bill that moved every ~1.2 seconds
 * (฿30/hour rounded to the satang) means the figure a staff member reads and the figure the backend
 * computes can differ by the time a confirm arrives — on a slow link they always do, and the customer
 * gets asked to re-confirm a price that changed while they watched. With a minute's granularity the
 * amount is stable for a whole minute, and a 1h 25m session is exactly ฿42.50.
 */
export function moneyForDurationMs(durationMs: number): number {
  const minutes = Math.ceil(Math.max(0, durationMs) / 60_000);
  return minutes * RATE_PER_MINUTE_SATANG;
}

/** Bill for one session, priced server-side from the stored check-in time (never from a posted amount). */
export function sessionAmountSatang(session: Session, now = Date.now()): number {
  const end = session.checkOutTime ? Date.parse(session.checkOutTime) : now;
  return moneyForDurationMs(end - Date.parse(session.checkInTime));
}

/**
 * Staff-facing `Group` projection (`docs/api-contract.md` §2).
 *
 * `sessionId` and `amountSatang` are additive optional fields, which §3.4 explicitly allows inside
 * `/api/v1` (add only, never remove/rename). They exist so a staff client can address one member's
 * check-out and show the exact amount the backend will accept, instead of re-deriving the bill
 * itself and risking a `BILL_AMOUNT_MISMATCH` on a rounding difference.
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
    status: group.status,
    startTime: group.startTime,
    tags: entries,
    amountSatang: entries.reduce((total, entry) => total + entry.amountSatang, 0),
  };
}
