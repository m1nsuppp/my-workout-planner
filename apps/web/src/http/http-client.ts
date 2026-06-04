// API와의 transport 경계. 봉투(envelope)·검증을 모른다 —
// method·path·body를 보내고 status·raw body를 받는 것까지가 책임.
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// HttpClient.request 파라미터로만 쓰여 export하지 않는다(외부 소비처 없음).
interface HttpRequest {
  method: HttpMethod;
  path: string; // baseUrl 기준 상대 경로. 예) '/api/routines'
  body?: unknown; // JSON 직렬화 대상. 없으면 본문 없는 요청
}

export interface HttpResponse {
  status: number;
  body: unknown; // JSON 역직렬화 결과. 본문이 없으면 undefined
}

// SSE 스트림의 종료 결과. delta 토큰은 onDelta로 흘리고, 마지막에 result(성공) 또는 error(실패)로 끝난다.
// data: result면 raw 페이로드, error면 ApiError 형태({code,message}). status는 스트림 시작 응답의 HTTP status.
export interface SseOutcome {
  status: number;
  event: 'result' | 'error';
  data: unknown;
}

export interface HttpClient {
  request: (req: HttpRequest) => Promise<HttpResponse>;
  // SSE 요청. message 토큰을 onDelta로 흘리고 result/error 이벤트로 끝난다. 봉투·검증은 모른다(상위 몫).
  stream: (req: HttpRequest, onDelta: (text: string) => void) => Promise<SseOutcome>;
}
