/**
 * Environment resolution, in one place.
 *
 * Development defaults exist so a fresh clone runs with **no** `.env` and no database
 * (`docs/backend-mvp.md`). Anything that would be unsafe to default — a database URL, the UID pepper —
 * is required explicitly on the Postgres path and the server refuses to start without it.
 */

export type StoreKind = 'memory' | 'postgres';

/**
 * Development-only pepper. It is a real HMAC key, but it is public in this repo, so it protects nothing;
 * the server rejects it whenever a database is in use (a persisted hash outlives the code that made it,
 * so this must be right *before* the first row — `docs/supabase-migration-plan.md`).
 */
export const DEV_TAG_UID_PEPPER = 'dev-tag-uid-pepper-not-for-production';

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
  tagUidPepper: string;
  deviceKey: string;
  staffToken: string;
  staffId: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const store: StoreKind = env.STORE === 'postgres' ? 'postgres' : 'memory';
  const tagUidPepper = (env.TAG_UID_PEPPER ?? '').trim() || DEV_TAG_UID_PEPPER;
  const databaseUrl = resolveDatabaseUrl(env);

  if (store === 'postgres') {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when STORE=postgres (see backend/.env.example).');
    }
    if (tagUidPepper === DEV_TAG_UID_PEPPER) {
      throw new Error(
        'TAG_UID_PEPPER must be set to a private value when STORE=postgres: the development pepper is '
        + 'public in this repo, and persisted UID hashes cannot be re-keyed cheaply afterwards.',
      );
    }
  }

  return {
    port: Number(env.PORT ?? 3000),
    store,
    databaseUrl,
    tagUidPepper,
    deviceKey: env.DEVICE_API_KEY ?? 'dev-device-key',
    staffToken: env.STAFF_API_TOKEN ?? 'dev-staff-token',
    staffId: env.DEV_STAFF_ID ?? 'staff-dev-1',
  };
}
