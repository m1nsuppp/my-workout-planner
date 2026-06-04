import type { HttpClient, HttpMethod, HttpResponse, SseOutcome } from './http-client';

// 테스트용 in-memory transport. mock이 아니라 실제로 동작하는 fake —
// 등록(stub)한 응답을 그대로 돌려주고, 미등록 경로는 버그로 간주해 reject한다.
export interface StreamScenario {
  deltas?: string[]; // onDelta로 차례로 흘릴 message 토큰
  outcome: SseOutcome; // 마지막 result/error
}

export interface FakeHttpClient extends HttpClient {
  stub: (method: HttpMethod, path: string, response: HttpResponse) => void;
  stubStream: (method: HttpMethod, path: string, scenario: StreamScenario) => void;
}

export function createFakeHttpClient(): FakeHttpClient {
  const routes = new Map<string, HttpResponse>();
  const streams = new Map<string, StreamScenario>();
  const key = (method: HttpMethod, path: string): string => `${method} ${path}`;

  return {
    stub(method, path, response) {
      routes.set(key(method, path), response);
    },
    stubStream(method, path, scenario) {
      streams.set(key(method, path), scenario);
    },
    async request({ method, path }) {
      await Promise.resolve(); // 실제 transport처럼 마이크로태스크 경계를 둔다(동기 반환 fake의 타이밍 왜곡 방지)
      const response = routes.get(key(method, path));
      if (response === undefined) {
        throw new Error(`등록되지 않은 요청: ${key(method, path)}`);
      }

      return response;
    },
    async stream({ method, path }, onDelta) {
      await Promise.resolve();
      const scenario = streams.get(key(method, path));
      if (scenario === undefined) {
        throw new Error(`등록되지 않은 스트림 요청: ${key(method, path)}`);
      }
      for (const delta of scenario.deltas ?? []) {
        onDelta(delta);
      }

      return scenario.outcome;
    },
  };
}
