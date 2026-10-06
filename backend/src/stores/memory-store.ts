import {
  IDEMPOTENCY_WINDOW_MS,
  type AuditEntry,
  type CheckoutReceipt,
  type Group,
  type GroupView,
  type RosterMember,
  type Session,
  type Tag,
} from '../domain';
import type { AuditInput, OpenGroup, ReaderOutcome, Repository, Transaction } from '../repository';

/**
 * Development repository: everything in process memory.
 *
 * This is the credential-free path (`docs/backend-mvp.md`) — no database, no `.env`, cleared on
 * restart — and it is also the reference implementation of `Transaction`: with one process and no
 * concurrency to speak of, a "transaction" is just the callback, and a roster lookup is a map walk.
 * The Postgres implementation has to earn the same guarantees with row locks; behaviour between the
 * two is expected to be identical, so keep the decision logic in `app.ts`/`domain.ts` and this file
 * free of policy.
 *
 * The two coordination values (`openGroup`, `readerOutcome`) are process-local on purpose: the MVP is
 * documented as a single instance with a single physical reader. On Postgres they become a one-row
 * table, which is what makes a second instance possible — see `docs/supabase-migration-plan.md`.
 */
export class MemoryStore implements Repository, Transaction {
  readonly kind = 'memory' as const;

  private readonly tags = new Map<string, Tag>();       // keyed by UID hash — the lookup path
  private readonly tagsById = new Map<string, Tag>();   // keyed by tagId — rosters reference this
  private readonly sessions = new Map<string, Session>();
  private readonly groups = new Map<string, Group>();
  private readonly receipts = new Map<string, CheckoutReceipt>();
  private readonly audits: AuditEntry[] = [];
  private readonly scans = new Map<string, { at: number; response: unknown }>();
  private openGroupRef: OpenGroup | null = null;
  private readerOutcome: ReaderOutcome | null = null;

  describe(): string {
    return 'in-memory development store (no database credentials required; data is cleared when the server restarts)';
  }

  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return fn(this);
  }

  // ---- tags -----------------------------------------------------------------------------------

  async findTagByUidHash(uidHash: string): Promise<Tag | undefined> {
    return this.tags.get(uidHash);
  }

  /**
   * Registering a raw UID that is already known returns the existing tag identity instead of minting a
   * second one — re-running tag registration must not orphan live sessions, and a lost card is handled
   * by the disable + register-new-UID flow (`api-convention.md` §8.4), which is a different physical UID.
   */
  async registerTag(uidHash: string, label: string | null): Promise<Tag> {
    const existing = this.tags.get(uidHash);
    if (existing) {
      if (label !== null) existing.label = label;
      return existing;
    }
    const tag: Tag = { tagId: crypto.randomUUID(), uidHash, label, status: 'active' };
    this.tags.set(uidHash, tag);
    this.tagsById.set(tag.tagId, tag);
    return tag;
  }

  // ---- sessions & groups ----------------------------------------------------------------------

  async openSessionForTag(tagId: string): Promise<Session | undefined> {
    return [...this.sessions.values()].find((session) => session.tagId === tagId && session.status === 'open');
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.sessions.get(sessionId);
  }

  async createGroup(group: Group): Promise<void> {
    this.groups.set(group.groupId, group);
  }

  async addSessionToGroup(groupId: string, session: Session): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`group ${groupId} not found`);
    this.sessions.set(session.sessionId, session);
    group.sessionIds.push(session.sessionId);
  }

  async groupView(groupId: string): Promise<GroupView | undefined> {
    const group = this.groups.get(groupId);
    return group ? { group, members: this.membersOf(group) } : undefined;
  }

  /** Nothing to lock: one process, and a "transaction" here is the callback itself. */
  async lockGroup(groupId: string): Promise<GroupView | undefined> {
    return this.groupView(groupId);
  }

  async listGroupViews(status?: 'active' | 'closed'): Promise<GroupView[]> {
    return [...this.groups.values()]
      .filter((group) => !status || group.status === status)
      .map((group) => ({ group, members: this.membersOf(group) }));
  }

  async detachSession(groupId: string, sessionId: string, checkOutTime: string) {
    const session = this.sessions.get(sessionId);
    const group = this.groups.get(groupId);
    if (!session || !group) throw new Error(`session ${sessionId} not in group ${groupId}`);
    const closed = this.joined(session);
    session.status = 'closed';
    session.checkOutTime = checkOutTime;
    group.sessionIds = group.sessionIds.filter((id) => id !== sessionId);
    const remaining = this.membersOf(group).filter((member) => member.session.status === 'open');
    if (!remaining.length) group.status = 'closed';
    return { closed, remaining };
  }

  async closeGroup(groupId: string, checkOutTime: string) {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`group ${groupId} not found`);
    const closed = this.membersOf(group).filter((member) => member.session.status === 'open');
    for (const member of closed) {
      member.session.status = 'closed';
      member.session.checkOutTime = checkOutTime;
    }
    group.status = 'closed';
    group.sessionIds = [];
    return { closed };
  }

  async saveReceipt(sessionId: string, receipt: CheckoutReceipt): Promise<void> {
    this.receipts.set(sessionId, receipt);
  }

  async totalBilledSatang(): Promise<number> {
    return [...this.receipts.values()].reduce((total, receipt) => total + receipt.amount, 0);
  }

  // ---- reader coordination --------------------------------------------------------------------

  async openGroup(): Promise<OpenGroup | null> {
    return this.openGroupRef;
  }

  async setOpenGroup(open: OpenGroup | null): Promise<void> {
    this.openGroupRef = open;
  }

  async saveReaderOutcome(outcome: ReaderOutcome): Promise<void> {
    this.readerOutcome = outcome;
  }

  async claimReaderOutcome(): Promise<ReaderOutcome | null> {
    const claimed = this.readerOutcome;
    this.readerOutcome = null;
    return claimed;
  }

  // ---- audit & scan dedupe --------------------------------------------------------------------

  async appendAudit(entry: AuditInput): Promise<void> {
    this.audits.push({
      auditId: crypto.randomUUID(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      ...entry,
    });
  }

  async listAudits(): Promise<AuditEntry[]> {
    return [...this.audits];
  }

  async recentScan(uidHash: string, now: number): Promise<{ at: number; response: unknown } | null> {
    const recent = this.scans.get(uidHash);
    return recent && now - recent.at <= IDEMPOTENCY_WINDOW_MS ? recent : null;
  }

  async rememberScan(uidHash: string, at: number, response: unknown): Promise<void> {
    this.scans.set(uidHash, { at, response });
  }

  /**
   * Development-only reset (`POST /api/v1/demo/reset`). Clears operational state — groups, sessions,
   * receipts, join window, scan dedupe — but never the audit log: `rule.md` (CCA §26) requires ≥90-day
   * retention, and `api-convention.md` §8.2 forbids deleting log records from the API. Registered tag
   * identities also survive; staff registered them.
   */
  async reset(): Promise<void> {
    this.groups.clear();
    this.sessions.clear();
    this.receipts.clear();
    this.scans.clear();
    this.openGroupRef = null;
    this.readerOutcome = null;
  }

  // ---- internals ------------------------------------------------------------------------------

  private joined(session: Session): RosterMember {
    const tag = this.tagsById.get(session.tagId);
    if (!tag) throw new Error(`tag ${session.tagId} not found for session ${session.sessionId}`);
    return { tag, session };
  }

  private membersOf(group: Group): RosterMember[] {
    return group.sessionIds
      .map((sessionId) => this.sessions.get(sessionId))
      .filter((session): session is Session => !!session)
      .map((session) => this.joined(session));
  }
}
