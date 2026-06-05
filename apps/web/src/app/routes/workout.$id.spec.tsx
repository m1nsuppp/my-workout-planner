import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiResponseError } from '../../shared/api-response-error';
import { makePlan } from '../test-support/fixtures';
import { fakePlanService, renderRoute } from '../test-support/render-route';

const plan = makePlan({ status: 'in_progress' });

describe('운동 중(/workout/$id)', () => {
  it('계획을 불러오면 Day 제목과 운동을 보여준다', async () => {
    await renderRoute('/workout/p1', { planService: fakePlanService({ get: async () => plan }) });

    expect(await screen.findByText('상체 A')).toBeDefined();
    expect(screen.getByText('벤치')).toBeDefined();
  });

  it('없는 계획(404)은 not found 문구를 보여준다', async () => {
    await renderRoute('/workout/p1', {
      planService: fakePlanService({
        get: async () => {
          throw new ApiResponseError(404, { code: 'NOT_FOUND', message: '없음' });
        },
      }),
    });

    expect(await screen.findByText(/계획을 찾을 수 없어요/)).toBeDefined();
  });

  it('그 외 오류는 에러 문구를 보여준다', async () => {
    await renderRoute('/workout/p1', {
      planService: fakePlanService({
        get: async () => {
          throw new Error('boom');
        },
      }),
    });

    expect(await screen.findByText(/계획을 불러오지 못했어요/)).toBeDefined();
  });

  it('세트를 기록하면 기록됨으로 바뀐다', async () => {
    await renderRoute('/workout/p1', {
      planService: fakePlanService({
        get: async () => plan,
        updateSet: async () => plan.exercises[0].sets[0],
      }),
    });

    fireEvent.click(await screen.findByText('기록'));

    expect(await screen.findByText('기록됨 ✓')).toBeDefined();
  });

  it('운동 종료를 누르면 상태를 바꾸고 계획 상세로 이동한다', async () => {
    const { router } = await renderRoute('/workout/p1', {
      planService: fakePlanService({
        get: async () => plan,
        updateStatus: async () => makePlan({ status: 'completed' }),
      }),
    });

    fireEvent.click(await screen.findByText('운동 종료'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/plans/p1'));
  });

  it('코치에게 물어보기를 누르면 코치 화면으로 이동한다', async () => {
    const { router } = await renderRoute('/workout/p1', {
      planService: fakePlanService({ get: async () => plan }),
    });

    fireEvent.click(await screen.findByText('코치에게 물어보기'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/p1'));
  });
});
