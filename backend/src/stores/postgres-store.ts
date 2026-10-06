import postgres from 'postgres';
import type { Config } from '../config';
import { connectionOptions } from '../db/connect';
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

type Sql = ReturnType<typeof postgres>;
type Tx = postgres.TransactionSql;

type TagRow = { tag_id: string; uid_hash: string; label: string | null; status: 'active' | 'disabled' };
type SessionRow = {
  session_id: string; tag_id: string; group_id: string;
  check_in_time: Date; check_out_time: Date | null; status: 'open' | 'closed';
};
type GroupRow = { group_id: string; status: 'active' | 'closed'; start_time: Date };
type AuditRow = {
  audit_id: string; actor: string; tag_id: string | null; action: string;
  endpoint: string; result: 'success' | 'failure'; logged_at: Date;
};
type ReceiptRow = {
  amount_satang: number; rate_per_hour_satang: number; staff_id: string;
  confirmed_at: Date; bill_version: string;
};

const toTag = (row: TagRow): Tag => ({
  tagId: row.tag_id, uidHash: row.uid_hash, label: row.label, status: row.status,
});
const toSession = (row: SessionRow): Session => ({
  sessionId: row.session_id, tagId: row.tag_id, groupId: row.group_id,
  checkInTime: row.check_in_time.toISOString(),
  checkOutTime: row.check_out_time ? row.check_out_time.toISOString() : null,
  status: row.status,
});
const toGroup = (row: GroupRow, sessionIds: string[]): Group => ({
  groupId: row.group_id, status: row.status, startTime: row.start_time.toISOString(), sessionIds,
});
const toAudit = (row: AuditRow): AuditEntry => ({
  auditId: row.audit_id, actor: row.actor, tagId: row.tag_id, action: row.action,
  endpoint: row.endpoint, result: row.result, timestamp: row.logged_at.toISOString(),
});
const toReceipt = (row: ReceiptRow): CheckoutReceipt => ({
  amount: row.amount_satang, ratePerHour: row.rate_per_hour_satang, staffId: row.staff_id,
  confirmedAt: row.confirmed_at.toISOString(), billVersion: row.bill_version,
});

/**
 * One transaction scope on Postgres.
 *
 * The guarantees the in-memory store got for free have to be earned here, so this class holds the row
 * locks rather than the routes:
 *
 * - `openSessionForTag` takes a transaction-scoped advisory lock on the tag before looking for an open
 *   session, so two concurrent taps for the same card serialise; the partial unique index
 *   (`sessions_one_open_per_tag`) is the backstop if anything ever slips past it.
 * - `lockGroup` takes `FOR UPDATE` on the group row and on its open sessions. Every check-out prices
 *   from those locked rows, so a concurrent individual check-out cannot change a group total between
 *   the amount check and the write — the double-charge race.
 *
 * Taps across *different* cards are not serialised: there is one physical reader, so taps arrive one at
 * a time (`docs/api-contract.md` §1). A second reader would need a global scan lock as well.
 */
class PostgresTransaction implements Transaction {
  constructor(private readonly tx: Tx) {}

  // ---- tags -----------------------------------------------------------------------------------

  async findTagByUidHash(uidHash: string): Promise<Tag | undefined> {
    const [row] = await this.tx<TagRow[]>`select * from tags where uid_hash = ${uidHash}`;
    return row ? toTag(row) : undefined;
  }

  async registerTag(uidHash: string, label: string | null): Promise<Tag> {
    // Idempotent by UID hash: re-registering the same card keeps its identity (and its live sessions).
    const [row] = await this.tx<TagRow[]>`
      insert into tags (tag_id, uid_hash, label, status)
      values (${crypto.randomUUID()}, ${uidHash}, ${label}, 'active')
      on conflict (uid_hash) do update set label = coalesce(excluded.label, tags.label)
      returning *`;
    return toTag(row);
  }

  // ---- sessions & groups ----------------------------------------------------------------------

  async openSessionForTag(tagId: string): Promise<Session | undefined> {
    await this.tx`select pg_advisory_xact_lock(hashtextextended(${tagId}, 0))`;
    const [row] = await this.tx<SessionRow[]>`
      select * from sessions where tag_id = ${tagId} and status = 'open' for update`;
    return row ? toSession(row) : undefined;
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const [row] = await this.tx<SessionRow[]>`select * from sessions where session_id = ${sessionId}`;
    return row ? toSession(row) : undefined;
  }

  async createGroup(group: Group): Promise<void> {
    await this.tx`insert into groups (group_id, status, start_time)
      values (${group.groupId}, ${group.status}, ${group.startTime})`;
  }

  async addSessionToGroup(groupId: string, session: Session): Promise<void> {
    await this.tx`insert into sessions (session_id, tag_id, group_id, check_in_time, check_out_time, status)
      values (${session.sessionId}, ${session.tagId}, ${groupId}, ${session.checkInTime}, ${session.checkOutTime}, ${session.status})`;
  }

  async groupView(groupId: string): Promise<GroupView | undefined> {
    const [row] = await this.tx<GroupRow[]>`select * from groups where group_id = ${groupId}`;
    if (!row) return undefined;
    const [view] = await this.viewFor([row]);
    return view;
  }

  async lockGroup(groupId: string): Promise<GroupView | undefined> {
    const [row] = await this.tx<GroupRow[]>`select * from groups where group_id = ${groupId} for update`;
    if (!row) return undefined;
    await this.tx`select session_id from sessions where group_id = ${groupId} and status = 'open' for update`;
    const [view] = await this.viewFor([row]);
    return view;
  }

  async listGroupViews(status?: 'active' | 'closed'): Promise<GroupView[]> {
    const rows = await this.tx<GroupRow[]>`
      select * from groups
      where (${status ?? null}::text is null or status = ${status ?? null})
      order by start_time`;
    return this.viewFor(rows);
  }

  async detachSession(groupId: string, sessionId: string, checkOutTime: string) {
    const [closedRow] = await this.tx<SessionRow[]>`
      update sessions set status = 'closed', check_out_time = ${checkOutTime}
      where session_id = ${sessionId} and group_id = ${groupId} and status = 'open'
      returning *`;
    if (!closedRow) throw new Error(`session ${sessionId} is not open in group ${groupId}`);
    const [closed] = await this.membersFor([closedRow]);
    const remaining = await this.openMembers(groupId);
    if (!remaining.length) {
      await this.tx`update groups set status = 'closed' where group_id = ${groupId}`;
    }
    return { closed, remaining };
  }

  async closeGroup(groupId: string, checkOutTime: string) {
    const rows = await this.tx<SessionRow[]>`
      update sessions set status = 'closed', check_out_time = ${checkOutTime}
      where group_id = ${groupId} and status = 'open'
      returning *`;
    const closed = await this.membersFor(rows);
    await this.tx`update groups set status = 'closed' where group_id = ${groupId}`;
    return { closed };
  }

  async saveReceipt(sessionId: string, receipt: CheckoutReceipt): Promise<void> {
    // A confirmed receipt is evidence (ETA §9): the first confirmation for a session wins, and a later
    // write cannot quietly restate it. Correcting a bill would be a new, audited action.
    await this.tx`
      insert into receipts (session_id, amount_satang, rate_per_hour_satang, staff_id, confirmed_at, bill_version)
      values (${sessionId}, ${receipt.amount}, ${receipt.ratePerHour}, ${receipt.staffId}, ${receipt.confirmedAt}, ${receipt.billVersion})
      on conflict (session_id) do nothing`;
  }

  async totalBilledSatang(): Promise<number> {
    const [row] = await this.tx<{ total: number }[]>`
      select coalesce(sum(amount_satang), 0)::int as total from receipts`;
    return row.total;
  }

  // ---- reader coordination --------------------------------------------------------------------

  async openGroup(): Promise<OpenGroup | null> {
    const [row] = await this.tx<{ open_group_id: string | null; open_until: Date | null }[]>`
      select open_group_id, open_until from reader_state where id = true`;
    if (!row?.open_group_id || !row.open_until) return null;
    return { groupId: row.open_group_id, expiresAt: row.open_until.getTime() };
  }

  async setOpenGroup(open: OpenGroup | null): Promise<void> {
    if (!open) {
      await this.tx`update reader_state set open_group_id = null, open_until = null where id = true`;
      return;
    }
    await this.tx`
      update reader_state
      set open_group_id = ${open.groupId}, open_until = ${new Date(open.expiresAt).toISOString()}
      where id = true`;
  }

  async saveReaderOutcome(outcome: ReaderOutcome): Promise<void> {
    await this.tx`
      insert into reader_outcome (id, group_id, payload, at)
      values (true, ${outcome.groupId}, ${this.tx.json(outcome.payload)}, now())
      on conflict (id) do update set group_id = excluded.group_id, payload = excluded.payload, at = now()`;
  }

  async claimReaderOutcome(): Promise<ReaderOutcome | null> {
    // Claim-once in a single statement: DELETE … RETURNING yields the removed row, so whichever
    // transport wins the race gets the outcome and the other gets nothing.
    const [row] = await this.tx<{ group_id: string; payload: Record<string, unknown> }[]>`
      delete from reader_outcome where id = true returning group_id, payload`;
    return row ? { groupId: row.group_id, payload: row.payload } : null;
  }

  // ---- audit & scan dedupe --------------------------------------------------------------------

  async appendAudit(entry: AuditInput): Promise<void> {
    await this.tx`
      insert into audit_log (audit_id, actor, tag_id, action, endpoint, result, logged_at)
      values (${crypto.randomUUID()}, ${entry.actor}, ${entry.tagId}, ${entry.action},
              ${entry.endpoint}, ${entry.result}, ${entry.timestamp ?? new Date().toISOString()})`;
  }

  async listAudits(): Promise<AuditEntry[]> {
    const rows = await this.tx<AuditRow[]>`select * from audit_log order by logged_at asc`;
    return rows.map(toAudit);
  }

  async recentScan(uidHash: string, now: number): Promise<{ at: number; response: unknown } | null> {
    const cutoff = new Date(now - IDEMPOTENCY_WINDOW_MS).toISOString();
    const [row] = await this.tx<{ at: Date; response: unknown }[]>`
      select at, response from scan_dedupe where uid_hash = ${uidHash} and at > ${cutoff}`;
    return row ? { at: row.at.getTime(), response: row.response } : null;
  }

  async rememberScan(uidHash: string, at: number, response: unknown): Promise<void> {
    // Keyed by UID hash, so the table cannot grow beyond the number of registered cards.
    await this.tx`
      insert into scan_dedupe (uid_hash, at, response)
      values (${uidHash}, ${new Date(at).toISOString()}, ${this.tx.json(response as never)})
      on conflict (uid_hash) do update set at = excluded.at, response = excluded.response`;
  }

  // ---- internals ------------------------------------------------------------------------------

  private async viewFor(groupRows: GroupRow[]): Promise<GroupView[]> {
    if (!groupRows.length) return [];
    const ids = groupRows.map((row) => row.group_id);
    const sessionRows = await this.tx<SessionRow[]>`
      select s.* from sessions s where s.group_id = any(${ids}::uuid[]) order by s.check_in_time`;
    const tags = await this.tagMap(sessionRows);
    return groupRows.map((row) => {
      const own = sessionRows.filter((session) => session.group_id === row.group_id);
      return {
        group: toGroup(row, own.map((session) => session.session_id)),
        members: own.map((session) => ({ tag: tags.get(session.tag_id)!, session: toSession(session) })),
      };
    });
  }

  private async openMembers(groupId: string): Promise<RosterMember[]> {
    const rows = await this.tx<SessionRow[]>`
      select * from sessions where group_id = ${groupId} and status = 'open' order by check_in_time`;
    return this.membersFor(rows);
  }

  private async membersFor(rows: SessionRow[]): Promise<RosterMember[]> {
    if (!rows.length) return [];
    const tags = await this.tagMap(rows);
    return rows.map((row) => ({ tag: tags.get(row.tag_id)!, session: toSession(row) }));
  }

  private async tagMap(rows: SessionRow[]): Promise<Map<string, Tag>> {
    const ids = [...new Set(rows.map((row) => row.tag_id))];
    if (!ids.length) return new Map();
    const tags = await this.tx<TagRow[]>`select * from tags where tag_id = any(${ids}::uuid[])`;
    return new Map(tags.map((row) => [row.tag_id, toTag(row)]));
  }
}

export class PostgresRepository implements Repository {
  readonly kind = 'postgres' as const;
  private readonly host: string;

  private constructor(private readonly sql: Sql, databaseUrl: string) {
    try {
      this.host = new URL(databaseUrl).host;
    } catch {
      this.host = 'configured database';
    }
  }

  static async connect(config: Config): Promise<PostgresRepository> {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required for the postgres store');
    const sql = postgres(config.databaseUrl, connectionOptions(config.databaseUrl));
    const repo = new PostgresRepository(sql, config.databaseUrl);
    await repo.ping();
    return repo;
  }

  describe(): string {
    return `postgres · ${this.host} (durable; audit log append-only with a ≥90-day retention job)`;
  }

  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => fn(new PostgresTransaction(tx)));
  }

  async ping(): Promise<void> {
    await this.sql`select 1`;
  }

  /**
   * Development-only reset (`POST /api/v1/demo/reset`): clears operational state — groups, sessions,
   * receipts, the join window, the pending reader outcome, scan dedupe — and deliberately leaves
   * `tags` (staff registered them) and `audit_log` (CCA §26 retention) untouched.
   */
  async reset(): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`delete from receipts`;
      await tx`delete from sessions`;
      await tx`delete from groups`;
      await tx`delete from scan_dedupe`;
      await tx`delete from reader_outcome`;
      await tx`update reader_state set open_group_id = null, open_until = null where id = true`;
    });
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
