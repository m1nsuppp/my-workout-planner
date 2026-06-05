import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListPlansResponseDto } from '@workout/contracts';
import type { PlanSummary } from '../../plans/repository';
import { fakeAuthService, fakePlanService, renderRoute } from '../test-support/render-route';

const summaries: PlanSummary[] = (() => {
  const envelope = ListPlansResponseDto.parse({
    ok: true,
    data: [
      {
        id: 'p1',
        date: '2026-05-25',
        status: 'scheduled',
        routineDayLabel: '상체 A',
        exerciseCount: 3,
      },
    ],
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
})();

describe('홈(/)', () => {
  it('미로그인이면 Google 로그인 링크를 보여준다', async () => {
    await renderRoute('/', { authService: fakeAuthService({ me: async () => null }) });

    expect(await screen.findByText('Google로 로그인')).toBeDefined();
  });

  it('로그인 상태면 사용자 이메일과 계획 목록을 보여준다', async () => {
    await renderRoute('/', {
      planService: fakePlanService({ list: async () => summaries }),
    });

    expect(await screen.findByText(/님으로 로그인됨/)).toBeDefined();
    expect(await screen.findByText('상체 A')).toBeDefined();
  });

  it('계획이 없으면 빈 안내를 보여준다', async () => {
    await renderRoute('/', { planService: fakePlanService({ list: async () => [] }) });

    expect(await screen.findByText(/아직 만든 계획이 없어요/)).toBeDefined();
  });

  it('계획 조회가 실패하면 에러 문구를 보여준다', async () => {
    await renderRoute('/', {
      planService: fakePlanService({
        list: async () => {
          throw new Error('boom');
        },
      }),
    });

    expect(await screen.findByText(/계획을 불러오지 못했어요/)).toBeDefined();
  });
});
