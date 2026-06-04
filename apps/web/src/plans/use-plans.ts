import { useEffect, useState } from 'react';
import { usePlanService } from '../app/contexts/plan-service-context';
import type { PlanSummary } from './repository';

// 계획 목록(홈)의 상태 기계 — service.list()를 감싸 UI가 분기할 4상태로 노출한다.
// 실패는 값으로 흡수하지 않고 error로 노출(미로그인은 보호 라우트가 이미 차단).
export type PlansState =
  | { status: 'loading'; plans: readonly PlanSummary[] }
  | { status: 'empty'; plans: readonly PlanSummary[] }
  | { status: 'loaded'; plans: readonly PlanSummary[] }
  | { status: 'error'; plans: readonly PlanSummary[] };

export function usePlans(): PlansState {
  const service = usePlanService();
  const [state, setState] = useState<PlansState>({ status: 'loading', plans: [] });

  useEffect(() => {
    let alive = true;
    void service.list().then(
      (plans) => {
        if (alive) {
          setState({ status: plans.length === 0 ? 'empty' : 'loaded', plans });
        }
      },
      () => {
        if (alive) {
          setState({ status: 'error', plans: [] });
        }
      },
    );

    return () => {
      alive = false;
    };
  }, [service]);

  return state;
}
