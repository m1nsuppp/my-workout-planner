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

export interface HttpClient {
  request: (req: HttpRequest) => Promise<HttpResponse>;
}
