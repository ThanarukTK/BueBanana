import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'buebanana_staff_session';

function error(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

function allowed(path: string, method: string) {
  if (path === 'api/v1/groups') return method === 'GET';
  if (path === 'api/v1/audit-logs') return method === 'GET';
  if (path === 'api/v1/staff') return method === 'GET' || method === 'POST';
  if (/^api\/v1\/staff\/[^/]+$/.test(path)) return method === 'PATCH' || method === 'DELETE';
  if (/^api\/v1\/(groups\/[^/]+\/check-out|sessions\/[^/]+\/check-out)$/.test(path)) return method === 'POST';
  return false;
}

async function forward(request: NextRequest, path: string[]) {
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!apiBase) return error('ตั้งค่า API_BASE_URL ใน frontend/.env.local ก่อน', 503);
  if (!token) return error('กรุณาเข้าสู่ระบบพนักงาน', 401);

  const joinedPath = path.join('/');
  if (!allowed(joinedPath, request.method)) return error('เส้นทางหรือ method นี้ไม่เปิดให้ proxy', 404);
  const target = new URL(`${apiBase}/${joinedPath}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  let body: string | undefined;
  if (request.method === 'POST' || request.method === 'PATCH') {
    const incoming = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (/^api\/v1\/(groups\/[^/]+\/check-out|sessions\/[^/]+\/check-out)$/.test(joinedPath)) {
      const me = await fetch(`${apiBase}/api/v1/auth/staff/me`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8_000),
      });
      if (!me.ok) return error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
      const identity = await me.json() as { data?: { staff?: { staffId?: string } } };
      if (!identity.data?.staff?.staffId) return error('ไม่พบข้อมูลบัญชีพนักงาน', 401);
      body = JSON.stringify({ ...incoming, staffId: identity.data.staff.staffId });
    } else {
      body = JSON.stringify(incoming);
    }
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return error('ติดต่อ Backend ไม่ได้', 502);
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path);
}
export async function POST(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path);
}
export async function PATCH(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path);
}
export async function DELETE(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path);
}
