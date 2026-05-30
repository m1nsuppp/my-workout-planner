import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { getUserId } from './auth';
import type { Env } from './env';
import type { SessionRecord, SessionRepository } from './auth/session-repository';

// findValid가 now와 expiresAt를 비교하는 fake — 만료 판단을 실제로 수행한다.
function fakeSessionRepo(sessions: SessionRecord[]): SessionRepository {
  return {
    create: async (s) => ({ id: 'unused', ...s, createdAt: '' }),
    delete: async () => undefined,
    findValid: async (id, now) => sessions.find((s) => s.id === id && s.expiresAt > now) ?? null,
  };
}

const NOW = (): Date => new Date('2026-05-30T00:00:00.000Z');
const valid: SessionRecord = {
  id: 'sid-1',
  userId: 'u1',
  expiresAt: '2026-12-31T00:00:00.000Z',
  createdAt: '',
};
const expired: SessionRecord = {
  id: 'sid-2',
  userId: 'u2',
  expiresAt: '2020-01-01T00:00:00.000Z',
  createdAt: '',
};

// getUserId는 Context를 받으므로 작은 라우트로 노출해 결과를 관찰한다.
function whoami(repo: SessionRepository) {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/whoami', async (c) => c.json({ userId: await getUserId(c, repo, NOW) }));

  return app;
}

const requestWith = async (
  repo: SessionRepository,
  cookie?: string,
  env = { ENVIRONMENT: 'development' },
) =>
  await whoami(repo).request(
    '/whoami',
    cookie === undefined ? undefined : { headers: { Cookie: cookie } },
    env,
  );

describe('getUserId', () => {
  it('유효 sid 쿠키 → 세션의 userId', async () => {
    const res = await requestWith(fakeSessionRepo([valid]), 'sid=sid-1');
    expect(await res.json()).toEqual({ userId: 'u1' });
  });

  it('만료된 세션 → null', async () => {
    const res = await requestWith(fakeSessionRepo([expired]), 'sid=sid-2');
    expect(await res.json()).toEqual({ userId: null });
  });

  it('sid 쿠키 없음 → null', async () => {
    const res = await requestWith(fakeSessionRepo([valid]));
    expect(await res.json()).toEqual({ userId: null });
  });

  it('없는 sid → null', async () => {
    const res = await requestWith(fakeSessionRepo([valid]), 'sid=unknown');
    expect(await res.json()).toEqual({ userId: null });
  });

  it('프로덕션 환경에서도 유효 세션이면 인증된다 (환경 분기 없음)', async () => {
    const res = await requestWith(fakeSessionRepo([valid]), 'sid=sid-1', {
      ENVIRONMENT: 'production',
    });
    expect(await res.json()).toEqual({ userId: 'u1' });
  });
});
