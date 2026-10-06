/**
 * Audit-log retention job — `bun run retention`.
 *
 * `docs/rule.md` (CCA §26) keeps traffic logs for at least 90 days and requires deletion after that
 * unless a lawful hold applies. Retention is a **scheduled job**, never an API route
 * (`api-convention.md` §8.2), so it lives here as a script the demo can run on demand and a real
 * deployment runs on a schedule.
 */

import postgres from 'postgres';
import { resolveDatabaseUrl } from '../config';
import { connectionOptions } from './connect';

const retentionDays = Number(process.env.AUDIT_RETENTION_DAYS ?? 90);

if (import.meta.main) {
  let databaseUrl: string | null = null;
  try {
    databaseUrl = resolveDatabaseUrl(process.env);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Put it in backend/.env (see backend/.env.example).');
    process.exit(1);
  }
  const sql = postgres(databaseUrl, connectionOptions(databaseUrl));
  try {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const [row] = await sql<{ removed: number }[]>`
      select purge_audit_log_before(${cutoff.toISOString()}::timestamptz) as removed
    `;
    console.log(`Audit retention: removed ${row.removed} entr${row.removed === 1 ? 'y' : 'ies'} older than `
      + `${retentionDays} days (before ${cutoff.toISOString()}).`);
  } finally {
    await sql.end();
  }
}
