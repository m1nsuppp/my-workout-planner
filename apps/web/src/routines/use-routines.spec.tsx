import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListRoutinesResponseDto } from '@workout/contracts';
import type { ReactNode } from 'react';
import { ApiResponseError } from '../shared/api-response-error';
import { RoutineServiceProvider } from '../app/contexts/routine-service-context';
import type { Routine } from './repository';
import type { RoutineService } from './service';
import { useRoutines } from './use-routines';

// id가 brand 타입(RoutineId)이라 평문 객체로 못 만든다 — 계약 DTO로 parse해 검증 통과분을 쓴다.
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

// list만 제어하는 fake — get/create는 이 스위트에서 안 쓰이는 더미.
function fakeService(list: RoutineService['list']): RoutineService {
  return {
    list,
    get: async () => {
      throw new Error('unused');
    },
    create: async () => {
      throw new Error('unused');
    },
    chat: async () => {
      throw new Error('unused');
    },
  };
}

const wrapperFor = (service: RoutineService) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <RoutineServiceProvider service={service}>{children}</RoutineServiceProvider>;
  };

describe('useRoutines', () => {
  it('해결 전에는 loading이다', () => {
    // 영영 해결되지 않는 list — loading 상태가 유지되는지 본다.
    const pending = fakeService(async () => await new Promise<Routine[]>(() => undefined));
    const { result } = renderHook(() => useRoutines(), { wrapper: wrapperFor(pending) });

    expect(result.current.status).toBe('loading');
  });

  it('루틴이 있으면 loaded + 목록을 준다', async () => {
    const { result } = renderHook(() => useRoutines(), {
      wrapper: wrapperFor(fakeService(async () => [routine])),
    });

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.routines).toEqual([routine]);
  });

  it('루틴이 0개면 empty다', async () => {
    const { result } = renderHook(() => useRoutines(), {
      wrapper: wrapperFor(fakeService(async () => [])),
    });

    await waitFor(() => expect(result.current.status).toBe('empty'));
    expect(result.current.routines).toEqual([]);
  });

  it('list가 실패하면 error다', async () => {
    const failing = fakeService(async () => {
      throw new ApiResponseError(500, { code: 'INTERNAL', message: '서버 오류' });
    });
    const { result } = renderHook(() => useRoutines(), { wrapper: wrapperFor(failing) });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
