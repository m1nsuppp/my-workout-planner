import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createD1SessionRepository } from './d1-session-repository';

// 시계는 테스트가 제어한다(findValid에 now를 명시 주입).
const PAST = '2020-01-01T00:00:00.000Z';
const NOW = '2026-05-30T00:00:00.000Z';
const FUTURE = '2026-06-30T00:00:00.000Z';

describe('createD1SessionRepository (실제 D1)', () => {
  it('create 후 만료 전이면 findValid로 조회된다', async () => {
    const repo = createD1SessionRepository(env.DB);
    const created = await repo.create({ userId: 'u1', expiresAt: FUTURE });

    const found = await repo.findValid(created.id, NOW);
    expect(found).toEqual(created);
  });

  it('만료된(expiresAt ≤ now) 세션은 findValid가 null', async () => {
    const repo = createD1SessionRepository(env.DB);
    const created = await repo.create({ userId: 'u1', expiresAt: PAST });

    expect(await repo.findValid(created.id, NOW)).toBeNull();
  });

  it('delete 후에는 조회되지 않는다', async () => {
    const repo = createD1SessionRepository(env.DB);
    const created = await repo.create({ userId: 'u1', expiresAt: FUTURE });

    await repo.delete(created.id);
    expect(await repo.findValid(created.id, NOW)).toBeNull();
  });

  it('없는 sid는 null', async () => {
    const repo = createD1SessionRepository(env.DB);
    expect(await repo.findValid('nope', NOW)).toBeNull();
  });
});
