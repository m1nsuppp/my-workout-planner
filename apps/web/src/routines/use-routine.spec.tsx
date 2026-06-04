import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListRoutinesResponseDto } from '@workout/contracts';
import type { ReactNode } from 'react';
import { ApiResponseError } from '../shared/api-response-error';
import { RoutineServiceProvider } from '../app/contexts/routine-service-context';
import type { Routine } from './repository';
import type { RoutineService } from './service';
import { useRoutine } from './use-routine';

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

// get만 제어하는 fake — 나머지는 이 스위트에서 안 쓰이는 더미.
function fakeService(get: RoutineService['get']): RoutineService {
  return {
    get,
    list: async () => {
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

describe('useRoutine', () => {
  it('해결 전에는 loading이다', () => {
    const pending = fakeService(async () => await new Promise<Routine>(() => undefined));
    const { result } = renderHook(() => useRoutine('r1'), { wrapper: wrapperFor(pending) });

    expect(result.current.status).toBe('loading');
  });

  it('루틴을 찾으면 loaded + 루틴을 준다', async () => {
    const { result } = renderHook(() => useRoutine('r1'), {
      wrapper: wrapperFor(fakeService(async () => routine)),
    });

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current).toEqual({ status: 'loaded', routine });
  });

  it('404면 notfound다', async () => {
    const missing = fakeService(async () => {
      throw new ApiResponseError(404, { code: 'NOT_FOUND', message: '루틴을 찾을 수 없습니다.' });
    });
    const { result } = renderHook(() => useRoutine('nope'), { wrapper: wrapperFor(missing) });

    await waitFor(() => expect(result.current.status).toBe('notfound'));
  });

  it('그 외 실패는 error다', async () => {
    const failing = fakeService(async () => {
      throw new ApiResponseError(500, { code: 'INTERNAL', message: '서버 오류' });
    });
    const { result } = renderHook(() => useRoutine('r1'), { wrapper: wrapperFor(failing) });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
