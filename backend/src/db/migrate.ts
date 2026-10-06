/**
 * Migration runner — `bun run migrate`.
 *
 * Applies `backend/migrations/*.sql` in filename order, each inside its own transaction, recording what
 * ran in `schema_migrations` so re-running is safe. Plain SQL on purpose: the schema needs a partial
 * unique index, a trigger and a retention function, which a schema generator does not emit — and one
 * source of truth means the identical files are what run locally and on Supabase.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../config';
import { connectionOptions } from './connect';

const migrationsDir = join(import.meta.dir, '..', '..', 'migrations');

export async function migrate(databaseUrl: string, log: (message: string) => void = console.log) {
  const sql = postgres(databaseUrl, connectionOptions(databaseUrl));
  try {
    await sql`create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`;
    const applied = new Set(
      (await sql<{ version: string }[]>`select version from schema_migrations`).map((row) => row.version),
    );
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) {
        log(`= ${file} (already applied)`);
        continue;
      }
      const contents = await readFile(join(migrationsDir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`insert into schema_migrations (version) values (${file})`;
      });
      log(`+ ${file}`);
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  // Same resolution as the server, so a `[YOUR-PASSWORD]` placeholder or a missing password is reported
  // here as the actionable error rather than as a driver-level connection failure.
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
  await migrate(databaseUrl);
  console.log('Migrations up to date.');
}
