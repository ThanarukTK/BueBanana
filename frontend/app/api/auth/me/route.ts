import { NextRequest, NextResponse } from 'next/server';
import { readLegacyToken, readSession } from '@/lib/staff-auth';

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
