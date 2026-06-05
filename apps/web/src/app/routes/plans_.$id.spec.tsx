import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ApiResponseError } from '../../shared/api-response-error';
import type { Plan } from '../../plans/repository';
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

  it('운동 시작 후 계획 캐시가 무효화되어 운동 화면이 재조회한다', async () => {
    // 두 화면이 같은 client를 공유한다. staleTime/gcTime을 무한으로 둬 무효화가 유일한 refetch
    // 트리거가 되게 한다 — 무효화가 빠지면 운동 화면은 캐시(scheduled)를 그대로 쓰고 get은 1회에 머문다.
    let getCalls = 0;
    let status: Plan['status'] = 'scheduled';
    const planService = fakePlanService({
      get: async () => {
        getCalls += 1;

        return makePlan({ status });
      },
      updateStatus: async () => {
        status = 'in_progress';

        return makePlan({ status });
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
    });

    const { router } = await renderRoute('/plans/p1', { planService, queryClient });

    await screen.findByText('운동 시작'); // 상세에서 get 1회
    fireEvent.click(screen.getByText('운동 시작'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/workout/p1'));
    // 무효화로 detail(p1)이 stale → 운동 화면이 재조회 → get 2회차.
    await waitFor(() => expect(getCalls).toBe(2));
  });
});
