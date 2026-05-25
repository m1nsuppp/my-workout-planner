import type { Context } from 'hono';

// 신원 추출 관심사. 인증 흐름 상세는 별도 — 지금은 세션 대신 헤더로 식별(placeholder).
export function getUserId(c: Context): string | null {
  return c.req.header('x-user-id') ?? null;
}
