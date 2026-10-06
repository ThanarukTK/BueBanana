/**
 * The storage seam.
 *
 * Every read and write the API performs goes through this interface, so the persistence layer can be
 * swapped (`MemoryStore` → PostgreSQL/Supabase) without touching a route, a payload, or a WebSocket
 * message. Routes never see a table, a query, or a connection: they open a **transaction scope** and
 * call the operations below.
 *
 * `transaction(fn)` exists because a real database needs several statements to be atomic — a tap
 * creates a session *and* moves the join window; a check-out closes a session, updates its group,
 * writes a receipt and appends audit entries. In memory those were simply several statements against
 * Maps and could not fail halfway. On Postgres one scope is one transaction, and the store is
 * responsible for the row locks that make concurrent taps safe.
 *
 * Design rules for implementers:
 * - Nothing in here prices anything. Money and the scan/join decision stay in `domain.ts` + `app.ts`,
 *   so the in-memory and Postgres paths cannot drift in behaviour.
 * - `transaction` commits when `fn` resolves and rolls back when it throws. Returning an *error
 *   envelope* from `fn` is not a failure: the API may legitimately have recorded an audit entry for a
 *   rejected tap, and that must be kept.
 * - Ephemeral coordination (the open join window, the pending reader outcome) is part of this interface
 *   so a second server instance works too; `MemoryStore` keeps it process-local, which is only valid for
 *   the documented single-instance MVP.
 */

import type { AuditEntry, CheckoutReceipt, Group, GroupView, RosterMember, Session, Tag } from './domain';
import { type Config, type StoreKind } from './config';

export type AuditInput = Omit<AuditEntry, 'auditId' | 'timestamp'> & { timestamp?: string };
export type OpenGroup = { groupId: string; expiresAt: number };
export type ReaderOutcome = { groupId: string; payload: Record<string, unknown> };

export interface Transaction {
  // ---- tags (PB-15) ------------------------------------------------------------------------
  findTagByUidHash(uidHash: string): Promise<Tag | undefined>;
  registerTag(uidHash: string, label: string | null): Promise<Tag>;

  // ---- sessions & groups (PB-01…PB-04, PB-11…PB-13) ---------------------------------------
  /** The member's open session, locking the row on Postgres so two taps cannot both start one. */
  openSessionForTag(tagId: string): Promise<Session | undefined>;
  getSession(sessionId: string): Promise<Session | undefined>;
  createGroup(group: Group): Promise<void>;
  addSessionToGroup(groupId: string, session: Session): Promise<void>;
  groupView(groupId: string): Promise<GroupView | undefined>;
  /**
   * The same view, but with the group row and its open sessions held (`FOR UPDATE` on Postgres) for the
   * rest of the transaction. Every check-out prices from a locked view: without it, a concurrent
   * individual check-out could change a group total between the amount check and the write.
   */
  lockGroup(groupId: string): Promise<GroupView | undefined>;
  listGroupViews(status?: 'active' | 'closed'): Promise<GroupView[]>;
  /**
   * Individual check-out: close this session at `checkOutTime`, remove it from the group, and close
   * the group if no member is left. Both rosters come back joined with their tags, so the caller can
   * write the receipt/audit and render the reader's `group.updated` without another round trip.
   */
  detachSession(groupId: string, sessionId: string, checkOutTime: string): Promise<{ closed: RosterMember; remaining: RosterMember[] }>;
  /** Whole-group check-out: close every open session in the group at `checkOutTime`. */
  closeGroup(groupId: string, checkOutTime: string): Promise<{ closed: RosterMember[] }>;
  saveReceipt(sessionId: string, receipt: CheckoutReceipt): Promise<void>;
  /** Money actually taken — summed from receipts, so the floor view never re-derives it. */
  totalBilledSatang(): Promise<number>;

  // ---- reader coordination (§3.1 / §3.1.1 / §3.2) -----------------------------------------
  openGroup(): Promise<OpenGroup | null>;
  setOpenGroup(open: OpenGroup | null): Promise<void>;
  saveReaderOutcome(outcome: ReaderOutcome): Promise<void>;
  /** Claim-once: whatever transport reads it first (socket or poll), the next read gets nothing. */
  claimReaderOutcome(): Promise<ReaderOutcome | null>;

  // ---- audit (§8.2) and scan dedupe (§10) --------------------------------------------------
  appendAudit(entry: AuditInput): Promise<void>;
  listAudits(): Promise<AuditEntry[]>;
  recentScan(uidHash: string, now: number): Promise<{ at: number; response: unknown } | null>;
  rememberScan(uidHash: string, at: number, response: unknown): Promise<void>;
}

export interface Repository {
  readonly kind: StoreKind;
  /** Human-readable storage description, for the startup log. */
  describe(): string;
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Development-only operational reset (`POST /api/v1/demo/reset`). Never touches audit entries. */
  reset(): Promise<void>;
  /** Optional startup probe; must throw if the store is configured but unreachable. */
  ping?(): Promise<void>;
  close?(): Promise<void>;
}

export async function createRepository(config: Config): Promise<Repository> {
  if (config.store === 'postgres') {
    // Imported lazily: the credential-free path must not load a driver it has no use for.
    const { PostgresRepository } = await import('./stores/postgres-store');
    return PostgresRepository.connect(config);
  }
  const { MemoryStore } = await import('./stores/memory-store');
  return new MemoryStore();
}
