import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreatePlanRequestDto, CreatePlanResponseDto } from '@workout/contracts';
import type { ReactNode } from 'react';
import { ApiResponseError } from '../shared/api-response-error';
import { PlanServiceProvider } from '../app/contexts/plan-service-context';
import type { Plan, PlanDraft, PlanProposal } from './repository';
import type { PlanService } from './service';
import { usePlanChat, type PlanChatContext } from './use-plan-chat';

const draft: PlanDraft = CreatePlanRequestDto.parse({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [{ name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] }],
});

const createdPlan: Plan = (() => {
  const envelope = CreatePlanResponseDto.parse({
    ok: true,
    data: {
      ...draft,
      id: 'p1',
      status: 'scheduled',
      createdAt: '2026-05-25T00:00:00.000Z',
      exercises: [
        { name: '벤치', muscleGroups: ['chest'], sets: [{ id: 's1', targetWeightKg: 50, targetReps: 8 }] },
      ],
    },
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
})();

const context: PlanChatContext = { routineId: 'r1', routineDayLabel: '상체 A', date: '2026-05-25' };

function fakeService(opts: {
  chat?: PlanService['chat'];
  create?: PlanService['create'];
}): PlanService {
  return {
    get: async () => {
      throw new Error('unused');
    },
    nextDay: async () => {
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
    updateStatus: async () => {
      throw new Error('unused');
    },
    updateSet: async () => {
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

const asking: PlanProposal = { phase: 'asking', message: '오늘 컨디션 어때요?' };
const proposing: PlanProposal = { phase: 'proposing', message: '이 계획 어때요?', planDraft: draft };

describe('usePlanChat', () => {
  it('초기 상태는 idle이고 메시지가 비어있다', () => {
    const { result } = renderHook(() => usePlanChat(context), {
      wrapper: wrapperFor(fakeService({})),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.messages).toEqual([]);
    expect(result.current.proposal).toBeNull();
  });

  it('send는 컨텍스트(routineId/label/date)와 발화를 함께 보낸다', async () => {
    let sent: unknown = null;
    const { result } = renderHook(() => usePlanChat(context), {
      wrapper: wrapperFor(
        fakeService({
          chat: async (input) => {
            sent = input;

            return asking;
          },
        }),
      ),
    });

    act(() => {
      result.current.send('가볍게 가고 싶어');
    });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(sent).toMatchObject({
      routineId: 'r1',
      routineDayLabel: '상체 A',
      date: '2026-05-25',
      history: [{ role: 'user', content: '가볍게 가고 싶어' }],
    });
  });

  it('send → asking이면 user·assistant 메시지가 쌓이고 제안은 없다', async () => {
    const { result } = renderHook(() => usePlanChat(context), {
      wrapper: wrapperFor(fakeService({ chat: async () => asking })),
    });

    act(() => {
      result.current.send('계획 짜줘');
    });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.messages).toEqual([
      { role: 'user', content: '계획 짜줘' },
      { role: 'assistant', content: '오늘 컨디션 어때요?' },
    ]);
    expect(result.current.proposal).toBeNull();
  });

  it('send → proposing이면 proposal에 planDraft가 담긴다', async () => {
    const { result } = renderHook(() => usePlanChat(context), {
      wrapper: wrapperFor(fakeService({ chat: async () => proposing })),
    });

    act(() => {
      result.current.send('확정할래');
    });

    await waitFor(() => expect(result.current.proposal).toEqual(draft));
  });

  it('confirm은 proposal을 그대로 보내 계획을 생성한다', async () => {
    let created: PlanDraft | null = null;
    const { result } = renderHook(() => usePlanChat(context), {
      wrapper: wrapperFor(
        fakeService({
          chat: async () => proposing,
          create: async (d) => {
            created = d;

            return createdPlan;
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
    const { result } = renderHook(() => usePlanChat(context), {
      wrapper: wrapperFor(fakeService({})),
    });

    await expect(result.current.confirm()).rejects.toThrow();
  });

  it('chat이 실패하면 chatError 상태가 된다', async () => {
    const { result } = renderHook(() => usePlanChat(context), {
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

    await waitFor(() => expect(result.current.status).toBe('chatError'));
  });

  it('confirm이 실패하면 createError 상태가 된다', async () => {
    const { result } = renderHook(() => usePlanChat(context), {
      wrapper: wrapperFor(
        fakeService({
          chat: async () => proposing,
          create: async () => {
            throw new ApiResponseError(500, { code: 'INTERNAL', message: '서버 오류' });
          },
        }),
      ),
    });

    act(() => {
      result.current.send('go');
    });
    await waitFor(() => expect(result.current.proposal).toEqual(draft));

    await expect(result.current.confirm()).rejects.toThrow();
    await waitFor(() => expect(result.current.status).toBe('createError'));
  });
});
