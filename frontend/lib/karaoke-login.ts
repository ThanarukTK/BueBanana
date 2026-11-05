import type { StaffIdentity, StaffRole } from './staff-auth';

export type KaraokeAdmin = {
  admin_id?: string;
  username?: string;
  email?: string;
  role?: string;
};

/** Map a karaoke /admin/login success payload onto an NFC StaffIdentity. */
export function mapKaraokeToStaff(admin: KaraokeAdmin): StaffIdentity | null {
  if (!admin?.username && !admin?.admin_id) return null;
  const role: StaffRole = admin.role === 'admin' ? 'admin' : 'staff';
  return {
    staffId: `karaoke:${admin.admin_id ?? admin.username}`,
    username: admin.username ?? admin.admin_id ?? 'staff',
    displayName: admin.username ?? admin.admin_id ?? 'staff',
    role,
    apiToken: process.env.STAFF_API_TOKEN ?? '',
    apiStaffId: process.env.STAFF_ID?.trim() || 'staff-dev-1',
  };
}

export type KaraokeLoginResult =
  | { ok: true; admin: KaraokeAdmin }
  | { ok: false; kind: 'rejected'; message: string }
  | { ok: false; kind: 'unreachable' };

/**
 * POST the karaoke backend /admin/login. Never throws.
 * `rejected` = karaoke explicitly rejected the credentials (401/403/4xx).
 * `unreachable` = not configured, network error, or a non-4xx failure — caller may fall back.
 */
export async function karaokeLogin(username: string, password: string): Promise<KaraokeLoginResult> {
  const base = process.env.KARAOKE_API_BASE?.replace(/\/$/, '');
  const key = process.env.KARAOKE_API_KEY;
  if (!base || !key) return { ok: false, kind: 'unreachable' };
  try {
    const response = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ data: { username, password } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => ({})) as {
      success?: boolean;
      data?: KaraokeAdmin;
      error?: { message?: string };
    };
    if (response.ok && body.success && body.data) return { ok: true, admin: body.data };
    // Karaoke responds with HTTP 200 + success:false for invalid credentials (it does not use
    // 4xx status codes), so a successful HTTP response with success:false is a hard rejection.
    if (body.success === false) {
      return { ok: false, kind: 'rejected', message: body.error?.message ?? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    }
    if (response.status >= 400 && response.status < 500) {
      return { ok: false, kind: 'rejected', message: body.error?.message ?? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    }
    return { ok: false, kind: 'unreachable' };
  } catch {
    return { ok: false, kind: 'unreachable' };
  }
}
