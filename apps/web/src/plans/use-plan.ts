import { useEffect, useState } from 'react';
import { usePlanService } from '../app/contexts/plan-service-context';
import { ApiResponseError } from '../shared/api-response-error';
import type { Plan } from './repository';

// 계획 상세 화면의 상태 기계 — service.get(id)를 감싼다(루틴 상세 useRoutine과 동형).
// 없는 계획(404)은 일반 오류와 구분해 notfound로 분리한다.
export type PlanDetailState =
  | { status: 'loading' }
  | { status: 'loaded'; plan: Plan }
  | { status: 'notfound' }
  | { status: 'error' };

export function usePlan(id: string): PlanDetailState {
  const service = usePlanService();
  const [state, setState] = useState<PlanDetailState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void service.get(id).then(
      (plan) => {
        if (alive) {
          setState({ status: 'loaded', plan });
        }
      },
      (error: unknown) => {
        if (!alive) {
          return;
        }
        const notFound = error instanceof ApiResponseError && error.code === 'NOT_FOUND';
        setState({ status: notFound ? 'notfound' : 'error' });
      },
    );

    return () => {
      alive = false;
    };
  }, [service, id]);

  return state;
}
