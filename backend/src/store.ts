import {
  type AuditEntry,
  type CheckoutReceipt,
  type Group,
  type Session,
  type Tag,
  hashTagUid,
} from './domain';

export class MemoryStore {
  readonly tags = new Map<string, Tag>();
  readonly sessions = new Map<string, Session>();
  readonly groups = new Map<string, Group>();
  readonly audits: AuditEntry[] = [];
  readonly receipts = new Map<string, CheckoutReceipt>();
  openGroup: { groupId: string; expiresAt: number } | null = null;
  readonly recentScans = new Map<string, { at: number; response: unknown }>();

  registerTag(rawTagUid: string, label: string | null = null): Tag {
    const tag: Tag = {
      tagId: crypto.randomUUID(),
      uidHash: hashTagUid(rawTagUid),
      label,
      status: 'active',
    };
    this.tags.set(tag.uidHash, tag);
    return tag;
  }

  findTag(rawTagUid: string): Tag | undefined {
    return this.tags.get(hashTagUid(rawTagUid));
  }

  activeSessionForTag(tagId: string): Session | undefined {
    return [...this.sessions.values()].find((session) => session.tagId === tagId && session.status === 'open');
  }

  appendAudit(entry: Omit<AuditEntry, 'auditId' | 'timestamp'> & { timestamp?: string }): void {
    this.audits.push({
      auditId: crypto.randomUUID(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      ...entry,
    });
  }
}
