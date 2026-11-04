import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Staff authentication for the test phase.
 *
 * Today the console signs staff in against a **static credential stored in `frontend/.env`**, and
 * keeps the sign-in in a long-lived, signed, HttpOnly cookie so a staff member stays logged in
 * across reloads and dev-server restarts.
 *
 * `verifyStaffCredentials()` is the single seam for real authentication: when the identity service
 * is ready, replace its body with a call to that service and return the same `StaffIdentity`.
 * Nothing else in the app knows where credentials come from.
 */

export type StaffRole = 'staff' | 'admin';

export type StaffIdentity = {
  /** Public id the console shows and uses for self-checks. */
  staffId: string;
  username: string;
  displayName: string;
  role: StaffRole;
  /** Credential the Backend accepts today (its shared staff token). Never sent to the browser. */
  apiToken: string;
  /** The staff id the Backend attributes check-outs to. */
  apiStaffId: string;
};

export const SESSION_COOKIE = 'buebanana_staff_session';
/** 30 days — "stay signed in" without a remember-me checkbox. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

type DirectoryEntry = { username: string; password: string; role: StaffRole; displayName: string };

/**
 * Accounts come from `STAFF_ACCOUNTS` (`user:password:role:display`, separated by `;`) and/or the
 * single `STAFF_USERNAME` / `STAFF_PASSWORD` / `STAFF_ROLE` / `STAFF_DISPLAY_NAME` pair.
 */
function directory(): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];

  for (const part of (process.env.STAFF_ACCOUNTS ?? '').split(';')) {
    const [username, password, role, displayName] = part.split(':').map((value) => value?.trim());
    if (!username || !password) continue;
    entries.push({
      username,
      password,
      role: role === 'admin' ? 'admin' : 'staff',
      displayName: displayName || username,
    });
  }

  const username = process.env.STAFF_USERNAME?.trim();
  const password = process.env.STAFF_PASSWORD;
  if (username && password) {
    entries.push({
      username,
      password,
      role: process.env.STAFF_ROLE?.trim() === 'staff' ? 'staff' : 'admin',
      displayName: process.env.STAFF_DISPLAY_NAME?.trim() || username,
    });
  }

  return entries;
}

/** Compares digests so neither length nor content leaks through timing. */
function constantTimeEquals(left: string, right: string) {
  const a = createHmac('sha256', 'staff-credential-compare').update(left).digest();
  const b = createHmac('sha256', 'staff-credential-compare').update(right).digest();
  return timingSafeEqual(a, b);
}

export function verifyStaffCredentials(username: string, password: string): StaffIdentity | null {
  const account = directory().find((entry) => constantTimeEquals(entry.username, username));
  if (!account || !constantTimeEquals(account.password, password)) return null;

  return {
    staffId: `local:${account.username}`,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    apiToken: process.env.STAFF_API_TOKEN ?? '',
    apiStaffId: process.env.STAFF_ID?.trim() || 'staff-dev-1',
  };
}

export function listStaffAccounts() {
  return directory().map((entry) => ({
    staffId: `local:${entry.username}`,
    username: entry.username,
    displayName: entry.displayName,
    role: entry.role,
    status: 'active' as const,
  }));
}

function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  return null;
}

type SessionPayload = {
  v: 1;
  /** staff id shown in the console */
  s: string;
  u: string;
  d: string;
  r: StaffRole;
  /** Backend token */
  t: string;
  /** Backend staff id */
  k: string;
  /** expiry, epoch seconds */
  e: number;
};

export type StaffSession = StaffIdentity & { expiresAt: number };

/** Signed, HttpOnly session value. `null` when SESSION_SECRET is missing (nothing is issued). */
export function createSession(identity: StaffIdentity): { name: string; value: string; maxAge: number } | null {
  const secret = sessionSecret();
  if (!secret) return null;

  const payload: SessionPayload = {
    v: 1,
    s: identity.staffId,
    u: identity.username,
    d: identity.displayName,
    r: identity.role,
    t: identity.apiToken,
    k: identity.apiStaffId,
    e: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return { name: SESSION_COOKIE, value: `${body}.${mac}`, maxAge: SESSION_MAX_AGE };
}

export function readSession(request: NextRequest): StaffSession | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator < 1) return null;

  const body = raw.slice(0, separator);
  const mac = raw.slice(separator + 1);
  const secret = sessionSecret();
  if (!secret) return null;

  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.v !== 1 || payload.e * 1000 <= Date.now()) return null;
    return {
      staffId: payload.s,
      username: payload.u,
      displayName: payload.d,
      role: payload.r,
      apiToken: payload.t,
      apiStaffId: payload.k,
      expiresAt: payload.e,
    };
  } catch {
    return null;
  }
}

/**
 * Keeps a Backend-issued JWT working if one is present in the cookie slot, so switching to the real
 * staff-account API does not lock anyone out mid-transition. A JWT has three dot-separated parts;
 * a session cookie has two.
 */
export function readLegacyToken(request: NextRequest): string | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  return raw && raw.split('.').length === 3 ? raw : null;
}
