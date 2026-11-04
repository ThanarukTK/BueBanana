import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const COOKIE = 'buebanana_staff_session';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: { message: 'คำขอไม่ถูกต้อง' } }, { status: 403 });
  }
  const response = NextResponse.json({ data: { loggedOut: true } }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
