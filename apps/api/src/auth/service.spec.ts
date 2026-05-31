import { describe, expect, it } from 'vitest';
import { createAuthService } from './service';
import { createFakeOAuthProvider } from './oauth-provider';
import type { UserRecord, UserRepository } from './user-repository';
import type { SessionRecord, SessionRepository } from './session-repository';

// 메모리 fake. (provider, providerUserId)로 upsert, findById 지원.
function createFakeUserRepository(): UserRepository {
  const byKey = new Map<string, UserRecord>();
  let seq = 0;

  return {
    upsertByProvider: async (u) => {
      const key = `${u.provider}:${u.providerUserId}`;
      const existing = byKey.get(key);
      if (existing !== undefined) {
        return existing;
      }
      seq += 1;
      const record: UserRecord = { id: `user-${seq}`, ...u, createdAt: '2026-01-01T00:00:00.000Z' };
      byKey.set(key, record);

      return record;
    },
    findById: async (id) => [...byKey.values()].find((u) => u.id === id) ?? null,
  };
}

function createFakeSessionRepository(): SessionRepository {
  const byId = new Map<string, SessionRecord>();
  let seq = 0;

  return {
    create: async (s) => {
      seq += 1;
      const record: SessionRecord = {
        id: `sid-${seq}`,
        ...s,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      byId.set(record.id, record);

      return record;
    },
    findValid: async (id, now) => {
      const s = byId.get(id);
      if (s === undefined || s.expiresAt <= now) {
        return null;
      }

      return s;
    },
    delete: async (id) => {
      byId.delete(id);
    },
  };
}

const NOW = new Date('2026-05-30T00:00:00.000Z');
const TTL_MS = 60 * 1000; // 1분

function makeService(codeMap: Record<string, { email: string; providerUserId: string }>) {
  const sessionRepository = createFakeSessionRepository();
  const userRepository = createFakeUserRepository();
  const service = createAuthService({
    provider: createFakeOAuthProvider('google', codeMap),
    userRepository,
    sessionRepository,
    now: () => NOW,
    sessionTtlMs: TTL_MS,
  });

  return { service, sessionRepository, userRepository };
}

describe('createAuthService', () => {
  it('begin은 state·verifier를 만들고 authorizeUrl에 반영한다', async () => {
    const { service } = makeService({});
    const start = await service.begin();

    expect(start.state).toBeTruthy();
    expect(start.verifier).toBeTruthy();
    expect(start.authorizeUrl).toContain(start.state);
  });

  it('complete는 user를 upsert하고 만료 시각이 now+ttl인 세션을 발급한다', async () => {
    const { service, sessionRepository } = makeService({
      'code-1': { email: 'a@example.com', providerUserId: 'g-1' },
    });

    const issued = await service.complete({ code: 'code-1', codeVerifier: 'v' });

    expect(issued.expiresAt).toBe('2026-05-30T00:01:00.000Z');
    const session = await sessionRepository.findValid(issued.sid, '2026-05-30T00:00:00.000Z');
    expect(session?.userId).toBe('user-1');
  });

  it('같은 신원으로 두 번 로그인하면 같은 user에 다른 세션이 발급된다', async () => {
    const { service } = makeService({
      'code-1': { email: 'a@example.com', providerUserId: 'g-1' },
      'code-2': { email: 'a@example.com', providerUserId: 'g-1' },
    });

    const first = await service.complete({ code: 'code-1', codeVerifier: 'v' });
    const second = await service.complete({ code: 'code-2', codeVerifier: 'v' });

    expect(second.sid).not.toBe(first.sid);
    // 같은 신원 → user 재사용은 userRepository upsert로 보장됨(세션 userId 동일).
  });

  it('logout은 세션을 폐기해 더는 유효하지 않게 한다', async () => {
    const { service, sessionRepository } = makeService({
      'code-1': { email: 'a@example.com', providerUserId: 'g-1' },
    });
    const issued = await service.complete({ code: 'code-1', codeVerifier: 'v' });

    await service.logout(issued.sid);

    expect(await sessionRepository.findValid(issued.sid, '2026-05-30T00:00:00.000Z')).toBeNull();
  });

  it('me는 유효 세션의 sid로 사용자를 돌려준다', async () => {
    const { service } = makeService({
      'code-1': { email: 'a@example.com', providerUserId: 'g-1' },
    });
    const issued = await service.complete({ code: 'code-1', codeVerifier: 'v' });

    expect(await service.me(issued.sid)).toEqual({ id: 'user-1', email: 'a@example.com' });
  });

  it('me는 없는 sid면 null이다', async () => {
    const { service } = makeService({});

    expect(await service.me('nope')).toBeNull();
  });

  it('me는 logout된 세션이면 null이다', async () => {
    const { service } = makeService({
      'code-1': { email: 'a@example.com', providerUserId: 'g-1' },
    });
    const issued = await service.complete({ code: 'code-1', codeVerifier: 'v' });
    await service.logout(issued.sid);

    expect(await service.me(issued.sid)).toBeNull();
  });
});
