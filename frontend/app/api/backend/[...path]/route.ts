import { NextRequest, NextResponse } from 'next/server';
import { listStaffAccounts, readLegacyToken, readSession } from '@/lib/staff-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


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

const CHECK_OUT = /^api\/v1\/(groups\/[^/]+\/check-out|sessions\/[^/]+\/check-out)$/;

/** Staff id for a Backend-issued JWT. Static test sessions carry it in the cookie instead. */
async function backendStaffId(apiBase: string, token: string): Promise<string | null> {
  try {
    const response = await fetch(`${apiBase}/api/v1/auth/staff/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { data?: { staff?: { staffId?: string } } };
    return payload.data?.staff?.staffId ?? null;
  } catch {
    return null;
  }
}

async function forward(request: NextRequest, path: string[]) {
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
  const session = readSession(request);
  const token = session?.apiToken || readLegacyToken(request);
  if (!apiBase) return error('ตั้งค่า API_BASE_URL ใน frontend/.env ก่อน', 503);
  if (!session && !token) return error('กรุณาเข้าสู่ระบบพนักงาน', 401);
  if (session && !session.apiToken) return error('ยังไม่ได้ตั้งค่า STAFF_API_TOKEN ใน frontend/.env', 503);

  const joinedPath = path.join('/');
  if (!allowed(joinedPath, request.method)) return error('เส้นทางหรือ method นี้ไม่เปิดให้ proxy', 404);
  const target = new URL(`${apiBase}/${joinedPath}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  let body: string | undefined;
  if (request.method === 'POST' || request.method === 'PATCH') {
    const incoming = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (CHECK_OUT.test(joinedPath)) {
      // A static test session already knows the Backend staff id; a Backend JWT is resolved via /me.
      const staffId = session?.apiStaffId ?? (token ? await backendStaffId(apiBase, token) : null);
      if (!staffId) return error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
      body = JSON.stringify({ ...incoming, staffId });
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
    if ((response.status === 404 || response.status === 405) && joinedPath.startsWith('api/v1/staff')) {
      if (joinedPath === 'api/v1/staff' && request.method === 'GET') {
        return NextResponse.json(
          { data: { staff: listStaffAccounts() }, meta: { source: 'frontend/.env' } },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return error('บัญชีพนักงานกำหนดจาก STAFF_ACCOUNTS ใน frontend/.env ในเฟสทดสอบ', 501);
    }

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
