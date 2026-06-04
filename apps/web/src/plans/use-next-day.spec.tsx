import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { ApiResponseError } from '../shared/api-response-error';
import { PlanServiceProvider } from '../app/contexts/plan-service-context';
import type { NextDay } from './repository';
import type { PlanService } from './service';
import { useNextDay } from './use-next-day';

function fakeService(nextDay: PlanService['nextDay']): PlanService {
  return {
    nextDay,
    get: async () => {
      throw new Error('unused');
    },
    create: async () => {
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
    list: async () => {
      throw new Error('unused');
    },
    coach: async () => {
      throw new Error('unused');
    },
    applyCoach: async () => {
      throw new Error('unused');
    },
  };
}

const wrapperFor = (service: PlanService) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <PlanServiceProvider service={service}>{children}</PlanServiceProvider>;
  };

const nextDay: NextDay = { routineDayId: 'd1', label: '상체 A' };

describe('useNextDay', () => {
  it('해결 전에는 loading이다', () => {
    const pending = fakeService(async () => await new Promise<NextDay>(() => undefined));
    const { result } = renderHook(() => useNextDay('r1'), { wrapper: wrapperFor(pending) });

    expect(result.current.status).toBe('loading');
  });

  it('조회되면 loaded + 다음 Day를 준다', async () => {
    const { result } = renderHook(() => useNextDay('r1'), {
      wrapper: wrapperFor(fakeService(async () => nextDay)),
    });

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current).toEqual({ status: 'loaded', nextDay });
  });

  it('실패하면 error다', async () => {
    const failing = fakeService(async () => {
      throw new ApiResponseError(404, { code: 'NOT_FOUND', message: '루틴을 찾을 수 없습니다.' });
    });
    const { result } = renderHook(() => useNextDay('r1'), { wrapper: wrapperFor(failing) });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
