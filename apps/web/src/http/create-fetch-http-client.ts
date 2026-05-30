import type { HttpClient } from './http-client';

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

      return { status: res.status, body: text === '' ? undefined : JSON.parse(text) };
    },
  };
}
