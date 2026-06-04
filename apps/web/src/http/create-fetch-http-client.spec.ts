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

// SSE 프레임들을 흘리는 fake fetch(text/event-stream).
function sseResponse(frames: string[]): typeof globalThis.fetch {
  return async () => {
    await Promise.resolve();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) {
          controller.enqueue(enc.encode(f));
        }
        controller.close();
      },
    });

    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}

describe('FetchHttpClient.stream', () => {
  it('delta 토큰을 onDelta로 흘리고 result 이벤트를 결과로 돌려준다', async () => {
    const http = createFetchHttpClient({
      baseUrl: '',
      fetch: sseResponse([
        'event: delta\ndata: {"text":"안녕"}\n\n',
        'event: delta\ndata: {"text":"하세요"}\n\n',
        'event: result\ndata: {"phase":"asking"}\n\n',
      ]),
    });

    let streamed = '';
    const outcome = await http.stream({ method: 'POST', path: '/chat', body: {} }, (t) => {
      streamed += t;
    });

    expect(streamed).toBe('안녕하세요');
    expect(outcome).toEqual({ status: 200, event: 'result', data: { phase: 'asking' } });
  });

  it('error 이벤트는 error 결과로 돌려준다', async () => {
    const http = createFetchHttpClient({
      baseUrl: '',
      fetch: sseResponse(['event: error\ndata: {"code":"LLM_FAILED","message":"x"}\n\n']),
    });

    const outcome = await http.stream({ method: 'POST', path: '/chat', body: {} }, () => undefined);

    expect(outcome).toEqual({
      status: 200,
      event: 'error',
      data: { code: 'LLM_FAILED', message: 'x' },
    });
  });

  it('스트림 전 실패(비 SSE 봉투)는 봉투의 error를 꺼내 error 결과로 정규화한다', async () => {
    const http = createFetchHttpClient({
      baseUrl: '',
      fetch: async () => {
        await Promise.resolve();

        return new Response(
          JSON.stringify({ ok: false, error: { code: 'UNAUTHENTICATED', message: '로그인 필요' } }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const outcome = await http.stream({ method: 'POST', path: '/chat', body: {} }, () => undefined);

    expect(outcome).toEqual({
      status: 401,
      event: 'error',
      data: { code: 'UNAUTHENTICATED', message: '로그인 필요' },
    });
  });
});
