import type { HttpClient, SseOutcome } from './http-client';

// 비-JSON 본문 에러 메시지에 실을 앞부분 길이(전체 HTML 덤프 방지).
const ERROR_BODY_PREVIEW = 200;
const EVENT_PREFIX = 'event:';
const DATA_PREFIX = 'data:';
const EVENT_SEP = '\n\n'; // SSE 이벤트 구분(빈 줄)

export interface FetchHttpClientOptions {
  // 요청 경로 앞에 붙는 오리진/프리픽스.
  // dev 프록시(단일 오리진)에선 '', 서브도메인 분리 시 'https://api.x.com'.
  baseUrl: string;
  // 주입용(테스트·SSR). 기본은 전역 fetch.
  fetch?: typeof globalThis.fetch;
}

export function createFetchHttpClient(options: FetchHttpClientOptions): HttpClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async request({ method, path, body }) {
      const res = await doFetch(`${options.baseUrl}${path}`, {
        method,
        credentials: 'include', // sid 세션 쿠키를 매 요청에 싣는다
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      // 204·빈 본문도 허용 — 봉투 해석은 상위(repository) 몫이라 여기선 raw만 넘긴다.
      const text = await res.text();
      if (text === '') {
        return { status: res.status, body: undefined };
      }

      try {
        return { status: res.status, body: JSON.parse(text) };
      } catch {
        // 서버가 봉투(JSON)가 아닌 본문(502 HTML 등)을 보냄 — raw SyntaxError 대신
        // transport 단계에서 status와 함께 명확히 드러낸다.
        throw new Error(
          `비-JSON 응답 본문 (status ${res.status}): ${text.slice(0, ERROR_BODY_PREVIEW)}`,
        );
      }
    },

    async stream({ method, path, body }, onDelta) {
      const res = await doFetch(`${options.baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      // 스트림 시작 전 실패(401/422 등)는 SSE가 아니라 일반 봉투로 온다 — error 결과로 정규화한다.
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || res.body === null || !contentType.includes('text/event-stream')) {
        const text = await res.text();
        let data: unknown = { code: 'STREAM_FAILED', message: '스트림 요청에 실패했어요.' };
        try {
          const envelope: unknown = JSON.parse(text);
          // 봉투의 error 객체만 꺼내 SSE error와 형태를 맞춘다.
          if (typeof envelope === 'object' && envelope !== null && 'error' in envelope) {
            data = envelope.error;
          }
        } catch {
          /* 비-JSON 본문이면 기본 error를 쓴다 */
        }

        return { status: res.status, event: 'error', data };
      }

      return await consumeSse(res.body, res.status, onDelta);
    },
  };
}

// SSE 본문을 끝까지 읽어 delta를 흘리고, 마지막 result/error 이벤트를 결과로 돌려준다.
async function consumeSse(
  body: ReadableStream<Uint8Array>,
  status: number,
  onDelta: (text: string) => void,
): Promise<SseOutcome> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let outcome: SseOutcome | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buf += decoder.decode(value, { stream: true });

    let sep = buf.indexOf(EVENT_SEP);
    while (sep !== -1) {
      const event = parseEvent(buf.slice(0, sep));
      buf = buf.slice(sep + EVENT_SEP.length);
      if (event === null) {
        sep = buf.indexOf(EVENT_SEP);
        continue;
      }
      if (event.name === 'delta') {
        const { data } = event;
        if (typeof data === 'object' && data !== null && 'text' in data && typeof data.text === 'string') {
          onDelta(data.text);
        }
      } else if (event.name === 'result' || event.name === 'error') {
        outcome = { status, event: event.name, data: event.data };
      }
      sep = buf.indexOf(EVENT_SEP);
    }
  }

  if (outcome === null) {
    throw new Error('SSE 스트림이 result/error 없이 종료됐습니다.');
  }

  return outcome;
}

// SSE 한 블록(여러 줄)에서 event 이름과 data(JSON)를 뽑는다. 형식이 안 맞으면 null.
function parseEvent(block: string): { name: string; data: unknown } | null {
  const lines = block.split('\n');
  const name = lines
    .find((l) => l.startsWith(EVENT_PREFIX))
    ?.slice(EVENT_PREFIX.length)
    .trim();
  const raw = lines
    .find((l) => l.startsWith(DATA_PREFIX))
    ?.slice(DATA_PREFIX.length)
    .trim();
  if (name === undefined || raw === undefined) {
    return null;
  }

  try {
    return { name, data: JSON.parse(raw) };
  } catch {
    return null;
  }
}
