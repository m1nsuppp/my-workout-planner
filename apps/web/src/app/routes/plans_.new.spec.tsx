import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreatePlanRequestDto } from '@workout/contracts';
import type { NextDay, PlanDraft, PlanProposal } from '../../plans/repository';
import { makePlan } from '../test-support/fixtures';
import { fakePlanService, renderRoute } from '../test-support/render-route';

const nextDay: NextDay = { routineDayId: 'd1', label: '상체 A' };

const draft: PlanDraft = CreatePlanRequestDto.parse({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
  ],
});

const asking: PlanProposal = { phase: 'asking', message: '오늘 컨디션 어때요?' };
const proposing: PlanProposal = {
  phase: 'proposing',
  message: '이 계획 어때요?',
  planDraft: draft,
};

describe('계획 만들기(/plans/new)', () => {
  it('다음 Day를 부르는 동안 로딩을 보여준다', async () => {
    await renderRoute('/plans/new?routineId=r1', {
      planService: fakePlanService({
        nextDay: async () => await new Promise<NextDay>(() => undefined),
      }),
    });

    expect(await screen.findByText(/다음 운동을 준비하는 중/)).toBeDefined();
  });

  it('다음 Day 조회가 실패하면 에러 문구를 보여준다', async () => {
    await renderRoute('/plans/new?routineId=r1', {
      planService: fakePlanService({
        nextDay: async () => {
          throw new Error('boom');
        },
      }),
    });

    expect(await screen.findByText(/다음 운동 정보를 불러오지 못했어요/)).toBeDefined();
  });

  it('다음 Day가 확정되면 대화 화면으로 진입한다', async () => {
    await renderRoute('/plans/new?routineId=r1', {
      planService: fakePlanService({ nextDay: async () => nextDay }),
    });

    expect(await screen.findByText('계획 만들기')).toBeDefined();
    expect(await screen.findByText(/상체 A/)).toBeDefined();
  });

  it('메시지를 보내면 코치 응답이 대화에 쌓인다', async () => {
    await renderRoute('/plans/new?routineId=r1', {
      planService: fakePlanService({ nextDay: async () => nextDay, chat: async () => asking }),
    });

    const input = await screen.findByPlaceholderText('메시지를 입력하세요');
    fireEvent.change(input, { target: { value: '가볍게 가고 싶어' } });
    fireEvent.click(screen.getByText('보내기'));

    expect(await screen.findByText('오늘 컨디션 어때요?')).toBeDefined();
    expect(screen.getByText('가볍게 가고 싶어')).toBeDefined();
  });

  it('제안을 확정하면 계획 상세로 이동한다', async () => {
    const { router } = await renderRoute('/plans/new?routineId=r1', {
      planService: fakePlanService({
        nextDay: async () => nextDay,
        chat: async () => proposing,
        create: async () => makePlan({ status: 'scheduled' }),
        get: async () => makePlan({ status: 'scheduled' }),
      }),
    });

    const input = await screen.findByPlaceholderText('메시지를 입력하세요');
    fireEvent.change(input, { target: { value: '확정할래' } });
    fireEvent.click(screen.getByText('보내기'));

    fireEvent.click(await screen.findByText('이 계획으로 확정'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/plans/p1'));
  });
});
