/**
 * Environment resolution, in one place.
 *
 * Development defaults exist so a fresh clone runs with **no** `.env` and no database
 * (`docs/backend-mvp.md`). Anything that would be unsafe to default — a database URL, the UID pepper —
 * is required explicitly on the Postgres path and the server refuses to start without it.
 */

export type StoreKind = 'memory' | 'postgres';

/**
 * The UID pepper (`TAG_UID_PEPPER`) was removed at the owner's request — `hashTagUid` no longer
 * keys on a secret (see domain.ts). The pepper requirement, the dev default and the Postgres guard
 * that went with it are gone. The value may still sit in `.env`; it is simply ignored.
 */

const PASSWORD_MARKER = /\[(?:YOUR-)?PASSWORD\]/i;

/**
 * Build the connection string from `.env`.
 *
 * Two real-world wrinkles this absorbs, both of which are silent or baffling if left to the caller:
 *
 * 1. The string copied from the Supabase dashboard contains a literal `[YOUR-PASSWORD]` token, and a
 *    password typed straight into a URL breaks the moment it contains `@ : / ? # &`. So the password may
 *    live in its own variable (`DATABASE_PASSWORD`) and is percent-encoded here — the URL keeps the
 *    dashboard's own shape and the secret is one obvious line.
 * 2. A URL wrapped in quotes (a habit from `.env` files elsewhere) is unquoted, and Prisma-only query
 *    parameters (`pgbouncer=true`) are dropped: Postgres rejects them as startup parameters.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.DATABASE_URL ?? '').trim().replace(/^["']([\s\S]*)["']$/, '$1').trim();
  if (!raw) return null;

  const withoutPrismaParams = raw
    .replace(/([?&])pgbouncer=[^&]*/i, '$1')
    .replace(/[?&]$/, '');

  if (!PASSWORD_MARKER.test(withoutPrismaParams)) return withoutPrismaParams;

  const password = (env.DATABASE_PASSWORD ?? '').trim();
  if (!password) {
    throw new Error(
      'DATABASE_URL still contains a [YOUR-PASSWORD] placeholder. Put the database password on its own '
      + 'line in backend/.env (DATABASE_PASSWORD=...) — it is percent-encoded for you, so characters '
      + 'like @ : / ? # & are safe. Reset it in Supabase under Project Settings → Database if you do not '
      + 'have it.',
    );
  }
  return withoutPrismaParams.replace(PASSWORD_MARKER, encodeURIComponent(password));
}

export type Config = {
  port: number;
  store: StoreKind;
  databaseUrl: string | null;
  deviceKey: string;
  staffToken: string;
  staffId: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const store: StoreKind = env.STORE === 'postgres' ? 'postgres' : 'memory';
  const databaseUrl = resolveDatabaseUrl(env);

  if (store === 'postgres' && !databaseUrl) {
    throw new Error('DATABASE_URL is required when STORE=postgres (see backend/.env.example).');
  }

  return {
    port: Number(env.PORT ?? 3000),
    store,
    databaseUrl,
    deviceKey: env.DEVICE_API_KEY ?? 'dev-device-key',
    staffToken: env.STAFF_API_TOKEN ?? 'dev-staff-token',
    staffId: env.DEV_STAFF_ID ?? 'staff-dev-1',
  };
}
