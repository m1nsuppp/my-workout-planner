import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreateRoutineResponseDto } from '@workout/contracts';
import type { ReactNode } from 'react';
import { ApiResponseError } from '../shared/api-response-error';
import { RoutineServiceProvider } from '../app/contexts/routine-service-context';
import type { Routine, RoutineDraft, RoutineProposal } from './repository';
import type { RoutineService } from './service';
import { useRoutineChat } from './use-routine-chat';

const draft: RoutineDraft = {
  name: '상하체 분할',
  goal: 'hypertrophy',
  splitType: 'upper_lower',
  daysPerWeek: 4,
  days: [{ label: '상체 A', exercises: [] }],
};

// id가 brand 타입이라 평문으로 못 만든다 — DTO로 parse해 검증 통과분을 쓴다.
const createdRoutine: Routine = (() => {
  const envelope = CreateRoutineResponseDto.parse({
    ok: true,
    data: { ...draft, id: 'r1', createdAt: '2026-05-01T00:00:00.000Z' },
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
})();

function fakeService(opts: {
  chat?: RoutineService['chat'];
  create?: RoutineService['create'];
}): RoutineService {
  return {
    list: async () => [],
    get: async () => {
      throw new Error('unused');
    },
    create:
      opts.create ??
      (async () => {
        throw new Error('unused');
      }),
    chat:
      opts.chat ??
      (async () => {
        throw new Error('unused');
      }),
  };
}

const wrapperFor = (service: RoutineService) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <RoutineServiceProvider service={service}>{children}</RoutineServiceProvider>;
  };

const asking: RoutineProposal = { phase: 'asking', message: '운동 경력은요?' };
const proposing: RoutineProposal = { phase: 'proposing', message: '이 루틴 어때요?', routine: draft };

describe('useRoutineChat', () => {
  it('초기 상태는 idle이고 메시지가 비어있다', () => {
    const { result } = renderHook(() => useRoutineChat(), {
      wrapper: wrapperFor(fakeService({})),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.messages).toEqual([]);
    expect(result.current.proposal).toBeNull();
  });

  it('send → asking이면 user·assistant 메시지가 쌓이고 제안은 없다', async () => {
    const { result } = renderHook(() => useRoutineChat(), {
      wrapper: wrapperFor(fakeService({ chat: async () => asking })),
    });

    act(() => {
      result.current.send('루틴 짜줘');
    });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.messages).toEqual([
      { role: 'user', content: '루틴 짜줘' },
      { role: 'assistant', content: '운동 경력은요?' },
    ]);
    expect(result.current.proposal).toBeNull();
  });

  it('send → proposing이면 proposal에 루틴이 담긴다', async () => {
    const { result } = renderHook(() => useRoutineChat(), {
      wrapper: wrapperFor(fakeService({ chat: async () => proposing })),
    });

    act(() => {
      result.current.send('확정하고 싶어');
    });

    await waitFor(() => expect(result.current.proposal).toEqual(draft));
  });

  it('confirm은 proposal을 그대로 보내 루틴을 생성한다', async () => {
    let created: RoutineDraft | null = null;
    const { result } = renderHook(() => useRoutineChat(), {
      wrapper: wrapperFor(
        fakeService({
          chat: async () => proposing,
          create: async (d) => {
            created = d;

            return createdRoutine;
          },
        }),
      ),
    });

    act(() => {
      result.current.send('go');
    });
    await waitFor(() => expect(result.current.proposal).toEqual(draft));

    await act(async () => {
      await result.current.confirm();
    });

    expect(created).toEqual(draft);
  });

  it('제안이 없으면 confirm은 거부된다', async () => {
    const { result } = renderHook(() => useRoutineChat(), {
      wrapper: wrapperFor(fakeService({})),
    });

    await expect(result.current.confirm()).rejects.toThrow();
  });

  it('chat이 실패하면 error 상태가 된다', async () => {
    const { result } = renderHook(() => useRoutineChat(), {
      wrapper: wrapperFor(
        fakeService({
          chat: async () => {
            throw new ApiResponseError(502, { code: 'LLM_FAILED', message: '실패' });
          },
        }),
      ),
    });

    act(() => {
      result.current.send('x');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
