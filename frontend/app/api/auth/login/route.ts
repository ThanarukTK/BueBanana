import { NextRequest, NextResponse } from 'next/server';
import { createSession, verifyStaffCredentials } from '@/lib/staff-auth';
import { karaokeLogin, mapKaraokeToStaff } from '@/lib/karaoke-login';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign-in.
 *
 * 1. Staff sign-in is validated against the karaoke backend's `/admin/login` (its credentials).
 *    On success the karaoke admin payload is mapped onto an NFC StaffIdentity and a signed
 *    30-day session cookie is issued — the same cookie every downstream route already accepts.
 * 2. If karaoke is unreachable (not configured / network error), the static credential from
 *    `frontend/.env` is verified as a fallback so offline dev still signs in. A definitive
 *    401 from karaoke is returned as 401 and never falls back.
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

  const karaoke = await karaokeLogin(credentials.username, credentials.password);
  if (karaoke.ok) {
    const identity = mapKaraokeToStaff(karaoke.admin);
    if (identity) {
      const session = createSession(identity);
      if (session) {
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
    }
  } else if (karaoke.kind === 'rejected') {
    return NextResponse.json(
      { error: { message: karaoke.message } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Karaoke unreachable, or karaoke succeeded but SESSION_SECRET is missing -> static fallback.
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
