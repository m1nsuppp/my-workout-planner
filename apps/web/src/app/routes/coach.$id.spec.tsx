import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CoachResponse } from '../../plans/repository';
import { makePlan } from '../test-support/fixtures';
import { fakePlanService, renderRoute } from '../test-support/render-route';

const adjustLoad: CoachResponse['change'] = {
  kind: 'adjust_load',
  targetExerciseName: '벤치',
  weightFactor: 0.8,
  reason: '컨디션 난조',
};

describe('운동 중 코치(/coach/$id)', () => {
  it('초기에는 안내 문구를 보여준다', async () => {
    await renderRoute('/coach/p1');

    expect(await screen.findByText(/코치가 교체·부하 조정·휴식을 제안해요/)).toBeDefined();
  });

  it('메시지를 보내면 코치 응답과 변경안을 보여준다', async () => {
    await renderRoute('/coach/p1', {
      planService: fakePlanService({
        coach: async () => ({ message: '무게를 낮춰요', change: adjustLoad }),
      }),
    });

    const input = await screen.findByPlaceholderText('예: 벤치 자리가 없어요');
    fireEvent.change(input, { target: { value: '어지러워요' } });
    fireEvent.click(screen.getByText('보내기'));

    expect(await screen.findByText('무게를 낮춰요')).toBeDefined();
    expect(await screen.findByText('적용하기')).toBeDefined();
  });

  it('변경안을 적용하면 운동 화면으로 돌아간다', async () => {
    const { router } = await renderRoute('/coach/p1', {
      planService: fakePlanService({
        coach: async () => ({ message: '무게를 낮춰요', change: adjustLoad }),
        applyCoach: async () => makePlan({ status: 'in_progress' }),
        get: async () => makePlan({ status: 'in_progress' }),
      }),
    });

    const input = await screen.findByPlaceholderText('예: 벤치 자리가 없어요');
    fireEvent.change(input, { target: { value: '어지러워요' } });
    fireEvent.click(screen.getByText('보내기'));

    fireEvent.click(await screen.findByText('적용하기'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/workout/p1'));
  });

  it('코치가 종료를 권하면 운동을 끝내고 계획 상세로 이동한다', async () => {
    const endSession: CoachResponse['change'] = { kind: 'end_session', reason: '충분히 했어요' };
    const { router } = await renderRoute('/coach/p1', {
      planService: fakePlanService({
        coach: async () => ({ message: '오늘은 여기까지', change: endSession }),
        updateStatus: async () => makePlan({ status: 'completed' }),
        get: async () => makePlan({ status: 'completed' }),
      }),
    });

    const input = await screen.findByPlaceholderText('예: 벤치 자리가 없어요');
    fireEvent.change(input, { target: { value: '너무 힘들어요' } });
    fireEvent.click(screen.getByText('보내기'));

    fireEvent.click(await screen.findByText('운동 종료'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/plans/p1'));
  });
});
