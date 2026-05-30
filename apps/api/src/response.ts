import type { ApiFailure } from '@workout/contracts';

// 응답 봉투 형성 관심사.

// HTTP 상태 코드 — 리터럴 타입으로 둬서 Hono의 status 유니온에 그대로 들어간다.
export const Status = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  UNPROCESSABLE: 422,
} as const;

// 성공 봉투를 해당 엔드포인트 DTO로 검증해 만든다(서버가 깨진 응답을 내보내지 않도록).
export function okBody<T>(schema: { parse: (value: unknown) => T }, data: unknown): T {
  return schema.parse({ ok: true, data });
}

// 실패 봉투를 만든다. 생성은 서버만 하므로 빌더는 여기(api)에 둔다.
export function failBody(code: string, message: string, details?: unknown): ApiFailure {
  return {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
