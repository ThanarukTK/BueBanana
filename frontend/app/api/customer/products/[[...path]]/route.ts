import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function error(message: string, status: number) {
  return NextResponse.json({ error: { message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

type RouteContext = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
  if (!apiBase) return error('ยังไม่ได้ตั้งค่า Backend สำหรับแค็ตตาล็อกสินค้า', 503);

  const segments = (await context.params).path ?? [];
  if (segments.length > 1 || segments.some((part) => !/^[a-zA-Z0-9_-]{1,100}$/.test(part))) {
    return error('ไม่พบเส้นทางสินค้า', 404);
  }

  const suffix = segments.length ? `/${encodeURIComponent(segments[0])}` : '';
  const target = new URL(`${apiBase}/api/v1/products${suffix}`);
  if (!segments.length) {
    request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  }

  try {
    const response = await fetch(target, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return error('ติดต่อ Backend เพื่อโหลดแค็ตตาล็อกสินค้าไม่ได้', 502);
  }
}
