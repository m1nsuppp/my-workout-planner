import { describe, expect, it } from 'vitest';
import { fakePlanService } from '../app/test-support/render-route';
import { planQueries } from './queries';

// queryOptions는 순수 함수라 렌더·QueryClient 없이 캐시 키 설계만 떼어 검증한다.
// queryFn이 service.list에 위임하는지는 라우트 통합 테스트(index.spec)에서 fake 주입으로 확인한다.
describe('planQueries.list', () => {
  it('range를 queryKey에 반영한다', () => {
    const opts = planQueries.list(fakePlanService(), { from: '2026-06-01', to: '2026-06-30' });

    expect(opts.queryKey).toEqual(['plans', 'list', { from: '2026-06-01', to: '2026-06-30' }]);
  });

  it('range가 없으면 키 끝이 null이다 — 전체 목록과 범위 조회 캐시를 분리한다', () => {
    const opts = planQueries.list(fakePlanService());

    expect(opts.queryKey).toEqual(['plans', 'list', null]);
  });
});

describe('planQueries.detail / nextDay', () => {
  it('detail은 id를 queryKey에 반영한다', () => {
    expect(planQueries.detail(fakePlanService(), 'p1').queryKey).toEqual(['plans', 'detail', 'p1']);
  });

  it('nextDay는 routineId를 queryKey에 반영한다', () => {
    expect(planQueries.nextDay(fakePlanService(), 'r1').queryKey).toEqual([
      'plans',
      'next-day',
      'r1',
    ]);
  });

  it('detail과 list는 같은 루트(plans)를 공유해 한 번에 무효화된다', () => {
    expect(planQueries.detail(fakePlanService(), 'p1').queryKey[0]).toBe(planQueries.all[0]);
  });
});
