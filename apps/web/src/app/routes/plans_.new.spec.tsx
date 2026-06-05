import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreatePlanRequestDto } from '@workout/contracts';
import type { NextDay, PlanDraft, PlanProposal } from '../../plans/repository';
import { makePlan } from '../test-support/fixtures';
import { fakePlanService, renderRoute } from '../test-support/render-route';

const nextDay: NextDay = { routineDayId: 'd1', label: '상체 A' };

const seed: PlanDraft = CreatePlanRequestDto.parse({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
  ],
});

const reply: PlanProposal = { message: '이 계획 어때요?', planDraft: seed };

// nextDay + 시드 초안까지 갖춘 기본 fake(여기에 케이스별로 override).
const ready = (over: Parameters<typeof fakePlanService>[0] = {}) =>
  fakePlanService({ nextDay: async () => nextDay, planDraft: async () => seed, ...over });

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

  it('시드 초안을 만드는 동안 로딩을 보여준다', async () => {
    await renderRoute('/plans/new?routineId=r1', {
      planService: fakePlanService({
        nextDay: async () => nextDay,
        planDraft: async () => await new Promise<PlanDraft>(() => undefined),
      }),
    });

    expect(await screen.findByText(/오늘 계획 초안을 만드는 중/)).toBeDefined();
  });

  it('시드 초안 조회가 실패하면 에러 문구를 보여준다', async () => {
    await renderRoute('/plans/new?routineId=r1', {
      planService: fakePlanService({
        nextDay: async () => nextDay,
        planDraft: async () => {
          throw new Error('boom');
        },
      }),
    });

    expect(await screen.findByText(/계획 초안을 불러오지 못했어요/)).toBeDefined();
  });

  it('진입 즉시 시드 카드(종목·확정 버튼)가 채워져 있다', async () => {
    await renderRoute('/plans/new?routineId=r1', { planService: ready() });

    expect(await screen.findByText('계획 만들기')).toBeDefined();
    expect(await screen.findByText('벤치')).toBeDefined();
    expect(await screen.findByText('이 계획으로 확정')).toBeDefined();
    expect(screen.getByDisplayValue('50')).toBeDefined();
  });

  it('컨디션 칩을 누르면 정해진 문장이 대화로 전송된다', async () => {
    let sent = '';
    await renderRoute('/plans/new?routineId=r1', {
      planService: ready({
        chat: async (input) => {
          sent = input.history.at(-1)?.content ?? '';

          return reply;
        },
      }),
    });

    fireEvent.click(await screen.findByText('보통'));

    expect(await screen.findByText('이 계획 어때요?')).toBeDefined();
    expect(sent).toBe('오늘 컨디션 보통.');
  });

  it('대화로 카드를 조정하면 코치 응답이 쌓인다', async () => {
    await renderRoute('/plans/new?routineId=r1', {
      planService: ready({ chat: async () => reply }),
    });

    const input = await screen.findByPlaceholderText(/스쿼트 50으로/);
    fireEvent.change(input, { target: { value: '52.5로 올려줘' } });
    fireEvent.click(screen.getByText('보내기'));

    expect(await screen.findByText('이 계획 어때요?')).toBeDefined();
    expect(screen.getByText('52.5로 올려줘')).toBeDefined();
  });

  it('카드에서 무게를 직접 고쳐 확정하면 그 값으로 저장하고 상세로 이동한다', async () => {
    const created: PlanDraft[] = [];
    const { router } = await renderRoute('/plans/new?routineId=r1', {
      planService: ready({
        create: async (d) => {
          created.push(d);

          return makePlan({ status: 'scheduled' });
        },
        get: async () => makePlan({ status: 'scheduled' }),
      }),
    });

    const weight = await screen.findByLabelText('kg');
    fireEvent.change(weight, { target: { value: '55' } });
    fireEvent.click(screen.getByText('이 계획으로 확정'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/plans/p1'));
    expect(created[0].exercises[0].sets[0].targetWeightKg).toBe(55);
  });
});
