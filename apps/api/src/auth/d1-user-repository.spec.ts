import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createD1UserRepository } from './d1-user-repository';

describe('createD1UserRepository (실제 D1)', () => {
  it('새 (provider, providerUserId)는 user를 생성한다', async () => {
    const repo = createD1UserRepository(env.DB);
    const user = await repo.upsertByProvider({
      provider: 'google',
      providerUserId: 'g-1',
      email: 'a@example.com',
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe('a@example.com');
    expect(await repo.findById(user.id)).toEqual(user);
  });

  it('같은 (provider, providerUserId) 재호출은 기존 user를 반환한다 (중복 생성 없음)', async () => {
    const repo = createD1UserRepository(env.DB);
    const first = await repo.upsertByProvider({
      provider: 'google',
      providerUserId: 'g-2',
      email: 'b@example.com',
    });
    // email이 바뀌어도 동일 신원이면 같은 레코드(첫 생성본)를 돌려준다.
    const second = await repo.upsertByProvider({
      provider: 'google',
      providerUserId: 'g-2',
      email: 'changed@example.com',
    });

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
  });

  it('같은 providerUserId라도 provider가 다르면 별개 신원이다', async () => {
    const repo = createD1UserRepository(env.DB);
    const google = await repo.upsertByProvider({
      provider: 'google',
      providerUserId: 'dup',
      email: 'c@example.com',
    });
    const github = await repo.upsertByProvider({
      provider: 'github',
      providerUserId: 'dup',
      email: 'c@example.com',
    });

    expect(github.id).not.toBe(google.id);
  });

  it('없는 id는 null', async () => {
    const repo = createD1UserRepository(env.DB);
    expect(await repo.findById('nope')).toBeNull();
  });
});
