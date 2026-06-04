import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListPlansResponseDto } from '@workout/contracts';
import type { ReactNode } from 'react';
import { ApiResponseError } from '../shared/api-response-error';
import { PlanServiceProvider } from '../app/contexts/plan-service-context';
import type { PlanSummary } from './repository';
import type { PlanService } from './service';
import { usePlans } from './use-plans';

const summaries: PlanSummary[] = (() => {
  const envelope = ListPlansResponseDto.parse({
    ok: true,
    data: [
      { id: 'p1', date: '2026-05-25', status: 'scheduled', routineDayLabel: '상체 A', exerciseCount: 3 },
    ],
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
})();

function fakeService(list: PlanService['list']): PlanService {
  const unused = async (): Promise<never> => {
    throw new Error('unused');
  };

  return {
    list,
    get: unused,
    create: unused,
    nextDay: unused,
    chat: unused,
    updateStatus: unused,
    updateSet: unused,
    coach: unused,
    applyCoach: unused,
  };
}

const wrapperFor = (service: PlanService) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <PlanServiceProvider service={service}>{children}</PlanServiceProvider>;
  };

describe('usePlans', () => {
  it('계획이 있으면 loaded + 목록을 준다', async () => {
    const { result } = renderHook(() => usePlans(), {
      wrapper: wrapperFor(fakeService(async () => summaries)),
    });

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.plans).toEqual(summaries);
  });

  it('비어 있으면 empty다', async () => {
    const { result } = renderHook(() => usePlans(), {
      wrapper: wrapperFor(fakeService(async () => [])),
    });

    await waitFor(() => expect(result.current.status).toBe('empty'));
  });

  it('실패하면 error다', async () => {
    const failing = fakeService(async () => {
      throw new ApiResponseError(500, { code: 'INTERNAL', message: '서버 오류' });
    });
    const { result } = renderHook(() => usePlans(), { wrapper: wrapperFor(failing) });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
