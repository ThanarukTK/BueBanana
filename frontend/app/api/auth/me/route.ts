import { NextRequest, NextResponse } from 'next/server';
import { createSession, readLegacyToken, readSession, verifyStaffCredentials } from '@/lib/staff-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE = 'buebanana_staff_session';

export async function GET(request: NextRequest) {
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
  const session = readSession(request);
  if (session) {
    return NextResponse.json(
      { data: { staff: { staffId: session.staffId, username: session.username, displayName: session.displayName, role: session.role } } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Test convenience: issue the configured static staff session on first visit.
  // Production hosting must opt in explicitly; credentials remain server-side.
  const autoLoginEnabled = process.env.NODE_ENV === 'development'
    ? process.env.AUTO_LOGIN_DEV === 'true'
    : process.env.NODE_ENV === 'production' && process.env.AUTO_LOGIN_STAFF === 'true';
  if (autoLoginEnabled) {
    const identity = verifyStaffCredentials(
      process.env.STAFF_USERNAME?.trim() ?? '',
      process.env.STAFF_PASSWORD ?? '',
    );
    const issued = identity ? createSession(identity) : null;
    if (identity && issued) {
      const output = NextResponse.json(
        { data: { staff: { staffId: identity.staffId, username: identity.username, displayName: identity.displayName, role: identity.role } } },
        { headers: { 'Cache-Control': 'no-store' } },
      );
      output.cookies.set(issued.name, issued.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: issued.maxAge,
      });
      return output;
    }
    return NextResponse.json(
      { error: { message: 'ตรวจสอบการตั้งค่าบัญชีทดสอบใน frontend/.env.local' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // A Backend-issued JWT (future staff-account API) is resolved through the Backend.
  const token = readLegacyToken(request);
  if (!token) return NextResponse.json({ error: { message: 'กรุณาเข้าสู่ระบบ' } }, { status: 401 });
  if (!apiBase) return NextResponse.json({ error: { message: 'ยังไม่ได้ตั้งค่า Backend' } }, { status: 503 });

  try {
    const response = await fetch(`${apiBase}/api/v1/auth/staff/me`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8_000),
    });
    const result = await response.text();
    const output = new NextResponse(result, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' },
    });
    if (response.status === 401) output.cookies.delete(COOKIE);
    return output;
  } catch {
    return NextResponse.json({ error: { message: 'ติดต่อ Backend ไม่ได้' } }, { status: 502 });
  }
}
