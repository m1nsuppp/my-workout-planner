import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GetPlanResponseDto } from '@workout/contracts';
import type { ReactNode } from 'react';
import { PlanServiceProvider } from '../app/contexts/plan-service-context';
import type { ApplyableChange, CoachResponse, Plan } from './repository';
import type { PlanService } from './service';
import { useCoach } from './use-coach';

const plan: Plan = (() => {
  const envelope = GetPlanResponseDto.parse({
    ok: true,
    data: {
      id: 'p1',
      routineId: 'r1',
      routineDayLabel: '상체 A',
      date: '2026-05-25',
      status: 'in_progress',
      exercises: [
        { name: '벤치', muscleGroups: ['chest'], sets: [{ id: 's1', targetWeightKg: 40, targetReps: 8 }] },
      ],
      createdAt: '2026-05-25T00:00:00.000Z',
    },
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
})();

interface CoachCalls {
  coach: PlanService['coach'];
  applyCoach?: PlanService['applyCoach'];
}

function fakeService(calls: CoachCalls): PlanService {
  const unused = async (): Promise<never> => {
    throw new Error('unused');
  };

  return {
    get: unused,
    create: unused,
    nextDay: unused,
    chat: unused,
    updateStatus: unused,
    updateSet: unused,
    coach: calls.coach,
    applyCoach: calls.applyCoach ?? unused,
  };
}

const wrapperFor = (service: PlanService) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <PlanServiceProvider service={service}>{children}</PlanServiceProvider>;
  };

describe('useCoach', () => {
  it('send 후 코치 메시지와 변경안을 받는다', async () => {
    const change: CoachResponse['change'] = {
      kind: 'adjust_load',
      targetExerciseName: '벤치',
      weightFactor: 0.8,
      reason: '컨디션 난조',
    };
    const service = fakeService({ coach: async () => ({ message: '무게를 낮춰요', change }) });
    const { result } = renderHook(() => useCoach('p1'), { wrapper: wrapperFor(service) });

    act(() => result.current.send('어지러워요'));

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.messages.at(-1)).toEqual({ role: 'assistant', content: '무게를 낮춰요' });
    expect(result.current.change).toEqual(change);
  });

  it('apply는 applying 변경안을 보내고 변형된 Plan을 돌려준다', async () => {
    let appliedChange: ApplyableChange | undefined = undefined;
    let appliedKey = '';
    const change: CoachResponse['change'] = {
      kind: 'adjust_load',
      targetExerciseName: '벤치',
      weightFactor: 0.8,
      reason: 'x',
    };
    const service = fakeService({
      coach: async () => ({ message: '낮춰요', change }),
      applyCoach: async (_planId, c, key) => {
        appliedChange = c;
        appliedKey = key;

        return plan;
      },
    });
    const { result } = renderHook(() => useCoach('p1'), { wrapper: wrapperFor(service) });

    act(() => result.current.send('힘들어요'));
    await waitFor(() => expect(result.current.change).not.toBeNull());

    const returned = await result.current.apply();

    expect(returned).toEqual(plan);
    expect(appliedChange).toMatchObject({ kind: 'adjust_load' });
    expect(appliedKey).toBeTruthy();
  });

  it('send 실패는 chatError', async () => {
    const service = fakeService({
      coach: async () => {
        throw new Error('boom');
      },
    });
    const { result } = renderHook(() => useCoach('p1'), { wrapper: wrapperFor(service) });

    act(() => result.current.send('x'));

    await waitFor(() => expect(result.current.status).toBe('chatError'));
  });
});
