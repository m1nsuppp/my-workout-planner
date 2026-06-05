import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiResponseError } from '../../shared/api-response-error';
import { makePlan } from '../test-support/fixtures';
import { fakePlanService, renderRoute } from '../test-support/render-route';

describe('계획 상세(/plans/$id)', () => {
  it('예정 계획은 운동 시작 버튼을 보여준다', async () => {
    await renderRoute('/plans/p1', {
      planService: fakePlanService({ get: async () => makePlan({ status: 'scheduled' }) }),
    });

    expect(await screen.findByText('상체 A')).toBeDefined();
    expect(screen.getByText('운동 시작')).toBeDefined();
  });

  it('없는 계획(404)은 not found 문구를 보여준다', async () => {
    await renderRoute('/plans/p1', {
      planService: fakePlanService({
        get: async () => {
          throw new ApiResponseError(404, { code: 'NOT_FOUND', message: '없음' });
        },
      }),
    });

    expect(await screen.findByText(/계획을 찾을 수 없어요/)).toBeDefined();
  });

  it('그 외 오류는 에러 문구를 보여준다', async () => {
    await renderRoute('/plans/p1', {
      planService: fakePlanService({
        get: async () => {
          throw new Error('boom');
        },
      }),
    });

    expect(await screen.findByText(/계획을 불러오지 못했어요/)).toBeDefined();
  });

  it('운동 시작을 누르면 상태를 바꾸고 운동 화면으로 이동한다', async () => {
    const { router } = await renderRoute('/plans/p1', {
      planService: fakePlanService({
        get: async () => makePlan({ status: 'scheduled' }),
        updateStatus: async () => makePlan({ status: 'in_progress' }),
      }),
    });

    fireEvent.click(await screen.findByText('운동 시작'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/workout/p1'));
  });
});
