import type { Context } from 'hono';
import type { Env } from './env';

// 신원 추출 관심사. 인증 흐름 상세는 별도 — 지금은 헤더 기반 placeholder.
// 프로덕션에선 x-user-id 헤더를 신뢰하지 않는다(IDOR 방지, fail-closed).
// 실제 인증이 들어오기 전까지 프로덕션은 항상 미인증 처리된다.
export function getUserId(c: Context<{ Bindings: Env }>): string | null {
  if (c.env.ENVIRONMENT === 'production') {
    return null;
  }

  return c.req.header('x-user-id') ?? null;
}
