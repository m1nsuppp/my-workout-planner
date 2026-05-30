import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from './env';
import type { SessionRepository } from './auth/session-repository';

// 신원 추출. sid 쿠키 → 유효 세션 조회로 userId를 도출한다.
// 세션이 없거나 만료면 null(미인증). 환경(dev/prod) 분기 없음 — 세션 자체가 fail-closed.
export async function getUserId(
  c: Context<{ Bindings: Env }>,
  sessionRepository: SessionRepository,
  now: () => Date,
): Promise<string | null> {
  const sid = getCookie(c, 'sid');
  if (sid === undefined) {
    return null;
  }

  const session = await sessionRepository.findValid(sid, now().toISOString());

  return session?.userId ?? null;
}
