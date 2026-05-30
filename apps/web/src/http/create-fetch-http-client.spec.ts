import { describe, expect, it } from 'vitest';
import { createFetchHttpClient } from './create-fetch-http-client';

// 주입한 fetch가 항상 같은 Response를 주는 fake. mock이 아니라 동작하는 stub.
function respondWith(body: string | null, status: number): typeof globalThis.fetch {
  return async () => {
    await Promise.resolve();

    return new Response(body, { status });
  };
}

describe('FetchHttpClient', () => {
  it('200 JSON 본문을 파싱해 status와 함께 돌려준다', async () => {
    const http = createFetchHttpClient({ baseUrl: '', fetch: respondWith('{"ok":true}', 200) });

    const res = await http.request({ method: 'GET', path: '/x' });

    expect(res).toEqual({ status: 200, body: { ok: true } });
  });

  it('빈 본문(204)은 body를 undefined로 둔다', async () => {
    const http = createFetchHttpClient({ baseUrl: '', fetch: respondWith(null, 204) });

    const res = await http.request({ method: 'DELETE', path: '/x' });

    expect(res).toEqual({ status: 204, body: undefined });
  });

  it('비-JSON 본문(502 HTML 등)은 status를 담은 에러로 throw한다', async () => {
    const http = createFetchHttpClient({
      baseUrl: '',
      fetch: respondWith('<html>502 Bad Gateway</html>', 502),
    });

    await expect(http.request({ method: 'GET', path: '/x' })).rejects.toThrow(/status 502/);
  });

  it('baseUrl·method·body·credentials를 fetch 요청에 싣는다', async () => {
    const calls: Array<{ input: Parameters<typeof globalThis.fetch>[0]; init?: RequestInit }> = [];
    const http = createFetchHttpClient({
      baseUrl: '/api',
      fetch: async (input, init) => {
        await Promise.resolve();
        calls.push({ input, init });

        return new Response('{"ok":true}', { status: 201 });
      },
    });

    await http.request({ method: 'POST', path: '/routines', body: { name: '상하체' } });

    expect(calls[0]?.input).toBe('/api/routines');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.credentials).toBe('include');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: '상하체' }));
  });
});
