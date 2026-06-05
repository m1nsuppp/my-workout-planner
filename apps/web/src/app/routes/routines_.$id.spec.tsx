import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListRoutinesResponseDto } from '@workout/contracts';
import { ApiResponseError } from '../../shared/api-response-error';
import type { Routine } from '../../routines/repository';
import { fakeRoutineService, renderRoute } from '../test-support/render-route';

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

describe('루틴 상세(/routines/$id)', () => {
  it('루틴을 불러오면 이름과 계획 만들기 진입을 보여준다', async () => {
    await renderRoute('/routines/r1', {
      routineService: fakeRoutineService({ get: async () => routine }),
    });

    expect(await screen.findByText('상하체 분할')).toBeDefined();
    expect(screen.getByText('이 루틴으로 계획 만들기')).toBeDefined();
  });

  it('없는 루틴(404)은 not found 문구를 보여준다', async () => {
    await renderRoute('/routines/r1', {
      routineService: fakeRoutineService({
        get: async () => {
          throw new ApiResponseError(404, { code: 'NOT_FOUND', message: '없음' });
        },
      }),
    });

    expect(await screen.findByText(/루틴을 찾을 수 없어요/)).toBeDefined();
  });

  it('그 외 오류는 에러 문구를 보여준다', async () => {
    await renderRoute('/routines/r1', {
      routineService: fakeRoutineService({
        get: async () => {
          throw new Error('boom');
        },
      }),
    });

    expect(await screen.findByText(/루틴을 불러오지 못했어요/)).toBeDefined();
  });
});
