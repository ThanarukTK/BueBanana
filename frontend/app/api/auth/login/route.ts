import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE = 'buebanana_staff_session';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: { message: 'คำขอไม่ถูกต้อง' } }, { status: 403 });
  }
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
  if (!apiBase) return NextResponse.json({ error: { message: 'ยังไม่ได้ตั้งค่า Backend' } }, { status: 503 });

  const credentials = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  if (!credentials?.username || !credentials.password) {
    return NextResponse.json({ error: { message: 'กรอกชื่อผู้ใช้และรหัสผ่าน' } }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiBase}/api/v1/auth/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json() as {
      data?: { token?: string; expiresIn?: number; staff?: Record<string, unknown> };
      error?: { message?: string };
    };
    if (!response.ok || !result.data?.token || !result.data.staff) {
      return NextResponse.json({ error: { message: result.error?.message ?? 'เข้าสู่ระบบไม่สำเร็จ' } }, { status: response.status });
    }

    const output = NextResponse.json({ data: { staff: result.data.staff } }, { headers: { 'Cache-Control': 'no-store' } });
    output.cookies.set(COOKIE, result.data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: result.data.expiresIn ?? 28_800,
    });
    return output;
  } catch {
    return NextResponse.json({ error: { message: 'ติดต่อ Backend ไม่ได้' } }, { status: 502 });
  }
}
