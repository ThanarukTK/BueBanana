import { describe, expect, it } from 'bun:test';
import { createApp } from './app';
import { MemoryStore } from './store';

const deviceHeaders = { 'x-device-key': 'dev-device-key', 'content-type': 'application/json' };
const staffHeaders = { authorization: 'Bearer dev-staff-token', 'content-type': 'application/json' };

async function json(response: Response) {
  return response.json() as Promise<any>;
}

describe('backend MVP', () => {
  it('registers an opaque tag and handles a scan idempotently', async () => {
    const app = createApp(new MemoryStore());
    const registered = await app.handle(new Request('http://localhost/api/v1/nfc-tags', {
      method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid: '04A3B2C1D4', label: 'Demo A' }),
    }));
    expect(registered.status).toBe(201);
    const tag = await json(registered);
    expect(tag.data.tagId).toBeString();
    expect(JSON.stringify(tag)).not.toContain('04A3B2C1D4');

    const scanRequest = () => new Request('http://localhost/api/v1/scans', {
      method: 'POST', headers: deviceHeaders, body: JSON.stringify({ rawTagUid: '04A3B2C1D4' }),
    });
    const first = await app.handle(scanRequest());
    const retry = await app.handle(scanRequest());
    expect(first.status).toBe(200);
    expect(await json(first)).toEqual(await json(retry));
  });

  it('joins a second tag and rejects checkout without explicit confirmation', async () => {
    const store = new MemoryStore();
    const app = createApp(store);
    for (const rawTagUid of ['A', 'B']) {
      await app.handle(new Request('http://localhost/api/v1/nfc-tags', {
        method: 'POST', headers: staffHeaders, body: JSON.stringify({ rawTagUid }),
      }));
    }
    const scan = (rawTagUid: string) => app.handle(new Request('http://localhost/api/v1/scans', {
      method: 'POST', headers: deviceHeaders, body: JSON.stringify({ rawTagUid }),
    }));
    const first = await json(await scan('A'));
    const second = await json(await scan('B'));
    expect(first.data.screen).toBe('waiting');
    expect(second.data.screen).toBe('joined');

    const sessionId = [...store.sessions.keys()][0];
    const response = await app.handle(new Request(`http://localhost/api/v1/sessions/${sessionId}/check-out`, {
      method: 'POST', headers: staffHeaders, body: JSON.stringify({ staffId: 'staff-dev-1', amount: 0, customerConfirmed: false }),
    }));
    expect(response.status).toBe(400);
    expect((await json(response)).error.code).toBe('CONFIRMATION_REQUIRED');
  });
});
