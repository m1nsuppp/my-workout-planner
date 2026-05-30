import type { HttpClient } from './http-client';

// 비-JSON 본문 에러 메시지에 실을 앞부분 길이(전체 HTML 덤프 방지).
const ERROR_BODY_PREVIEW = 200;

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
  };
}
