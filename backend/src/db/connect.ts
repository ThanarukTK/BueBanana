/**
 * Driver options for a Postgres connection.
 *
 * Two failure modes this prevents, both of which otherwise cost an afternoon:
 *
 * 1. **Supabase connection modes.** The dashboard lists *Direct connection*
 *    (`db.<ref>.supabase.co:5432`) first, and on Free plans (and paid plans without the IPv4 add-on) it
 *    is IPv6-only — it simply fails from an IPv4-only home network. Use the shared pooler string
 *    instead. If the URL points at the pooler's **transaction** port (6543), prepared statements are
 *    not supported and must be switched off; the session port (5432) keeps them on.
 * 2. **TLS.** Supabase requires it; a local container for verification does not. Decided by host, so
 *    the same code runs against both without an env flag.
 */

export function connectionOptions(databaseUrl: string, overrides: Record<string, unknown> = {}) {
  let host = '';
  let port = '';
  try {
    const parsed = new URL(databaseUrl);
    host = parsed.hostname;
    port = parsed.port;
  } catch {
    /* unparseable URL: let the driver report it, with defaults below */
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  return {
    max: 5,
    // Keep the pool warm between taps. A demo taps sporadically, and each reconnect to the Supabase
    // pooler pays a fresh TLS handshake (and, from a distant region, hundreds of ms) — so an idle
    // timeout shorter than the gap between taps turns every tap into a cold connection. 0 would never
    // expire; 60s covers a demo pause without holding slots forever.
    idle_timeout: 60,
    // Transaction-mode pooling (port 6543) cannot use prepared statements.
    prepare: port !== '6543',
    ...(isLocal ? {} : { ssl: 'require' as const }),
    ...overrides,
  };
}
