import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, createSession, verifyStaffCredentials } from '@/lib/staff-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign-in.
 *
 * 1. If the Backend exposes its staff-account endpoint (`POST /api/v1/auth/staff/login`), that wins —
 *    its JWT is stored in the same cookie slot and everything downstream keeps working.
 * 2. While that endpoint does not exist (the current test phase), the static credential from
 *    `frontend/.env` is verified here and a signed 30-day session cookie is issued.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: { message: 'คำขอไม่ถูกต้อง' } }, { status: 403 });
  }

  const credentials = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  if (!credentials?.username || !credentials.password) {
    return NextResponse.json({ error: { message: 'กรอกชื่อผู้ใช้และรหัสผ่าน' } }, { status: 400 });
  }

  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
  if (apiBase) {
    const upstream = await fetchBackendLogin(apiBase, credentials);
    if (upstream === 'missing' || (!('token' in upstream) && upstream.status === 502)) {
      // No staff-account API on the Backend yet (or it is unreachable): the static test credential
      // below still signs the operator in, and the console shows the Backend as offline.
    } else if ('token' in upstream) {
      const output = NextResponse.json({ data: { staff: upstream.staff } }, { headers: { 'Cache-Control': 'no-store' } });
      output.cookies.set(SESSION_COOKIE, upstream.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: upstream.expiresIn,
      });
      return output;
    } else {
      return NextResponse.json(
        { error: { message: upstream.error } },
        { status: upstream.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  const identity = verifyStaffCredentials(credentials.username, credentials.password);
  if (!identity) {
    return NextResponse.json(
      { error: { message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const session = createSession(identity);
  if (!session) {
    return NextResponse.json(
      { error: { message: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน frontend/.env (อย่างน้อย 16 ตัวอักษร)' } },
      { status: 503 },
    );
  }

  const output = NextResponse.json(
    {
      data: {
        staff: {
          staffId: identity.staffId,
          username: identity.username,
          displayName: identity.displayName,
          role: identity.role,
        },
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  output.cookies.set(session.name, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
  });
  return output;
}

type BackendLogin =
  | { token: string; expiresIn: number; staff: Record<string, unknown> }
  | { error: string; status: number }
  | 'missing';

/** `'missing'` means the route is not implemented on the Backend yet (404/405/501). */
async function fetchBackendLogin(
  apiBase: string,
  credentials: { username?: string; password?: string },
): Promise<BackendLogin> {
  try {
    const response = await fetch(`${apiBase}/api/v1/auth/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404 || response.status === 405 || response.status === 501) return 'missing';

    const text = await response.text();
    let result: { data?: { token?: string; expiresIn?: number; staff?: Record<string, unknown> }; error?: { message?: string } } = {};
    try { result = JSON.parse(text) as typeof result; } catch { /* non-JSON error body */ }

    if (!response.ok || !result.data?.token || !result.data.staff) {
      return { error: result.error?.message ?? 'เข้าสู่ระบบไม่สำเร็จ', status: response.status };
    }
    return { token: result.data.token, expiresIn: result.data.expiresIn ?? 28_800, staff: result.data.staff };
  } catch {
    return { error: 'ติดต่อ Backend ไม่ได้', status: 502 };
  }
}
