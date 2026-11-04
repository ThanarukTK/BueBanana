import WebSocket from 'ws';
import { readLegacyToken, readSession } from '@/lib/staff-auth';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable(message: string, status: number) {
  return Response.json({ error: { message } }, { status });
}

export async function GET(request: NextRequest) {
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
  const token = readSession(request)?.apiToken || readLegacyToken(request);
  if (!token) return unavailable('กรุณาเข้าสู่ระบบพนักงาน', 401);
  if (!apiBase) return unavailable('ตั้งค่า API_BASE_URL ใน frontend/.env.local ก่อน', 503);

  const wsBase = apiBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const upstream = new WebSocket(`${wsBase}/ws/admin`, { headers: { Authorization: `Bearer ${token}` } });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let ended = false;
      const send = (text: string) => {
        if (ended) return;
        try { controller.enqueue(encoder.encode(text)); } catch { finish(); }
      };
      const finish = () => {
        if (ended) return;
        ended = true;
        clearInterval(heartbeat);
        request.signal.removeEventListener('abort', finish);
        if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
        try { controller.close(); } catch { /* the browser already cancelled the stream */ }
      };
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), 20_000);

      upstream.on('open', () => send(': connected\n\n'));
      upstream.on('message', (data) => send(`data: ${data.toString()}\n\n`));
      upstream.on('error', () => {
        send(`event: upstream-error\ndata: ${JSON.stringify({ message: 'เชื่อมต่อช่องกิจกรรมจาก Backend ไม่ได้' })}\n\n`);
        finish();
      });
      upstream.on('close', finish);
      request.signal.addEventListener('abort', finish, { once: true });
    },
    cancel() {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
