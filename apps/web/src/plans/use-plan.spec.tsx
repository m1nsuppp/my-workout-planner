import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GetPlanResponseDto } from '@workout/contracts';
import type { ReactNode } from 'react';
import { ApiResponseError } from '../shared/api-response-error';
import { PlanServiceProvider } from '../app/contexts/plan-service-context';
import type { Plan } from './repository';
import type { PlanService } from './service';
import { usePlan } from './use-plan';

const plan: Plan = (() => {
  const envelope = GetPlanResponseDto.parse({
    ok: true,
    data: {
      id: 'p1',
      routineId: 'r1',
      routineDayLabel: '상체 A',
      date: '2026-05-25',
      status: 'scheduled',
      exercises: [
        {
          name: '벤치',
          muscleGroups: ['chest'],
          sets: [{ id: 's1', targetWeightKg: 50, targetReps: 8 }],
        },
      ],
      createdAt: '2026-05-25T00:00:00.000Z',
    },
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
})();

function fakeService(get: PlanService['get']): PlanService {
  return {
    get,
    create: async () => {
      throw new Error('unused');
    },
    nextDay: async () => {
      throw new Error('unused');
    },
    chat: async () => {
      throw new Error('unused');
    },
    updateStatus: async () => {
      throw new Error('unused');
    },
    updateSet: async () => {
      throw new Error('unused');
    },
  };
}

const wrapperFor = (service: PlanService) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <PlanServiceProvider service={service}>{children}</PlanServiceProvider>;
  };

describe('usePlan', () => {
  it('해결 전에는 loading이다', () => {
    const pending = fakeService(async () => await new Promise<Plan>(() => undefined));
    const { result } = renderHook(() => usePlan('p1'), { wrapper: wrapperFor(pending) });

    expect(result.current.status).toBe('loading');
  });

  it('계획을 찾으면 loaded + 계획을 준다', async () => {
    const { result } = renderHook(() => usePlan('p1'), {
      wrapper: wrapperFor(fakeService(async () => plan)),
    });

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current).toEqual({ status: 'loaded', plan });
  });

  it('404면 notfound다', async () => {
    const missing = fakeService(async () => {
      throw new ApiResponseError(404, { code: 'NOT_FOUND', message: '계획을 찾을 수 없습니다.' });
    });
    const { result } = renderHook(() => usePlan('nope'), { wrapper: wrapperFor(missing) });

    await waitFor(() => expect(result.current.status).toBe('notfound'));
  });

  it('그 외 실패는 error다', async () => {
    const failing = fakeService(async () => {
      throw new ApiResponseError(500, { code: 'INTERNAL', message: '서버 오류' });
    });
    const { result } = renderHook(() => usePlan('p1'), { wrapper: wrapperFor(failing) });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
