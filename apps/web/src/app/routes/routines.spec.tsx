import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListRoutinesResponseDto } from '@workout/contracts';
import type { Routine } from '../../routines/repository';
import { fakeAuthService, fakeRoutineService, renderRoute } from '../test-support/render-route';

const routine: Routine = (() => {
  const envelope = ListRoutinesResponseDto.parse({
    ok: true,
    data: [
      {
        id: 'r1',
        name: '상하체 분할',
        goal: 'hypertrophy',
        splitType: 'upper_lower',
        daysPerWeek: 4,
        days: [{ label: '상체 A', exercises: [] }],
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    ],
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data[0];
})();

describe('루틴 목록(/routines)', () => {
  it('루틴이 있으면 목록을 보여준다', async () => {
    await renderRoute('/routines', {
      routineService: fakeRoutineService({ list: async () => [routine] }),
    });

    expect(await screen.findByText('상하체 분할')).toBeDefined();
  });

  it('루틴이 없으면 빈 안내를 보여준다', async () => {
    await renderRoute('/routines', {
      routineService: fakeRoutineService({ list: async () => [] }),
    });

    expect(await screen.findByText(/아직 루틴이 없어요/)).toBeDefined();
  });

  it('조회가 실패하면 에러 문구를 보여준다', async () => {
    await renderRoute('/routines', {
      routineService: fakeRoutineService({
        list: async () => {
          throw new Error('boom');
        },
      }),
    });

    expect(await screen.findByText(/루틴을 불러오지 못했어요/)).toBeDefined();
  });

  it('미로그인이면 가드가 홈으로 돌려보낸다', async () => {
    const { router } = await renderRoute('/routines', {
      authService: fakeAuthService({ me: async () => null }),
    });

    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByText('Google로 로그인')).toBeDefined();
  });
});
