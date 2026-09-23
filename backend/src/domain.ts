import { createHash } from 'node:crypto';

export const RATE_PER_HOUR_SATANG = 3000;
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

export function hashTagUid(rawTagUid: string): string {
  return createHash('sha256').update(rawTagUid.trim().toUpperCase()).digest('hex');
}

export function moneyForDurationMs(durationMs: number): number {
  return Math.round((Math.max(0, durationMs) / 3_600_000) * RATE_PER_HOUR_SATANG);
}

export function groupResponse(group: Group, sessions: Map<string, Session>, tags: Map<string, Tag>) {
  return {
    groupId: group.groupId,
    status: group.status,
    startTime: group.startTime,
    tags: group.sessionIds.flatMap((sessionId) => {
      const session = sessions.get(sessionId);
      const tag = session && tags.get(session.tagId);
      return session && tag ? [{ tagId: tag.tagId, label: tag.label, checkInTime: session.checkInTime }] : [];
    }),
  };
}
