import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreatePlanRequestDto, CreatePlanResponseDto } from '@workout/contracts';
import type { ReactNode } from 'react';
import { ApiResponseError } from '../shared/api-response-error';
import { PlanServiceProvider } from '../app/contexts/plan-service-context';
import type { Plan, PlanDraft, PlanProposal } from './repository';
import type { PlanService } from './service';
import { usePlanChat, type PlanChatContext } from './use-plan-chat';

// 진입 시드 초안(편집 카드의 초기값).
const seed: PlanDraft = CreatePlanRequestDto.parse({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
  ],
});

// 대화 응답이 돌려주는 갱신된 카드(무게 52.5로 증량).
const updated: PlanDraft = CreatePlanRequestDto.parse({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 52.5, targetReps: 8 }] },
  ],
});

const createdPlan: Plan = (() => {
  const envelope = CreatePlanResponseDto.parse({
    ok: true,
    data: {
      ...seed,
      id: 'p1',
      status: 'scheduled',
      createdAt: '2026-05-25T00:00:00.000Z',
      exercises: [
        {
          name: '벤치',
          muscleGroups: ['chest'],
          sets: [{ id: 's1', targetWeightKg: 50, targetReps: 8 }],
        },
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
  const unused = async (): Promise<never> => {
    throw new Error('unused');
  };

  return {
    get: unused,
    nextDay: unused,
    planDraft: unused,
    create: opts.create ?? unused,
    chat: opts.chat ?? unused,
    updateStatus: unused,
    updateSet: unused,
    list: unused,
    coach: unused,
    applyCoach: unused,
  };
}

const wrapperFor = (service: PlanService) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <PlanServiceProvider service={service}>{children}</PlanServiceProvider>;
  };

const reply: PlanProposal = { message: '이 계획 어때요?', planDraft: updated };

describe('usePlanChat', () => {
  it('초기 상태는 idle, 메시지 비어있음, 카드는 시드 초안', () => {
    const { result } = renderHook(() => usePlanChat(context, seed), {
      wrapper: wrapperFor(fakeService({})),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.messages).toEqual([]);
    expect(result.current.draft).toEqual(seed);
  });

  it('send는 컨텍스트·현재 카드(draft)·발화를 함께 보낸다', async () => {
    let sent: unknown = null;
    const { result } = renderHook(() => usePlanChat(context, seed), {
      wrapper: wrapperFor(
        fakeService({
          chat: async (input) => {
            sent = input;

            return reply;
          },
        }),
      ),
    });

    act(() => {
      result.current.send('52.5로 올려줘');
    });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(sent).toMatchObject({
      routineId: 'r1',
      routineDayLabel: '상체 A',
      date: '2026-05-25',
      draft: seed,
      history: [{ role: 'user', content: '52.5로 올려줘' }],
    });
  });

  it('send → user·assistant 메시지가 쌓이고 카드는 응답으로 갱신된다', async () => {
    const { result } = renderHook(() => usePlanChat(context, seed), {
      wrapper: wrapperFor(fakeService({ chat: async () => reply })),
    });

    act(() => {
      result.current.send('올려줘');
    });

    await waitFor(() => expect(result.current.draft).toEqual(updated));
    expect(result.current.messages).toEqual([
      { role: 'user', content: '올려줘' },
      { role: 'assistant', content: '이 계획 어때요?' },
    ]);
  });

  it('editSet은 카드의 세트 한 칸을 직접 바꾼다', () => {
    const { result } = renderHook(() => usePlanChat(context, seed), {
      wrapper: wrapperFor(fakeService({})),
    });

    act(() => {
      result.current.editSet(0, 0, { targetWeightKg: 55 });
    });

    expect(result.current.draft.exercises[0].sets[0].targetWeightKg).toBe(55);
    expect(result.current.draft.exercises[0].sets[0].targetReps).toBe(8);
  });

  it('confirm은 현재 카드(편집분 포함)를 그대로 보내 계획을 생성한다', async () => {
    const created: PlanDraft[] = [];
    const { result } = renderHook(() => usePlanChat(context, seed), {
      wrapper: wrapperFor(
        fakeService({
          create: async (d) => {
            created.push(d);

            return createdPlan;
          },
        }),
      ),
    });

    act(() => {
      result.current.editSet(0, 0, { targetWeightKg: 55 });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(created[0].exercises[0].sets[0].targetWeightKg).toBe(55);
  });

  it('chat이 실패하면 chatError 상태가 된다', async () => {
    const { result } = renderHook(() => usePlanChat(context, seed), {
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
    const { result } = renderHook(() => usePlanChat(context, seed), {
      wrapper: wrapperFor(
        fakeService({
          create: async () => {
            throw new ApiResponseError(500, { code: 'INTERNAL', message: '서버 오류' });
          },
        }),
      ),
    });

    await expect(result.current.confirm()).rejects.toThrow();
    await waitFor(() => expect(result.current.status).toBe('createError'));
  });
});
