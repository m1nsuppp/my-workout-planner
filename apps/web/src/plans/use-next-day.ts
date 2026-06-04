import { useEffect, useState } from 'react';
import { usePlanService } from '../app/contexts/plan-service-context';
import type { NextDay } from './repository';

// 계획 생성 진입 시 "다음 차례 Day"를 한 번 조회하는 상태 기계.
// 성공하면 그 Day를 기본 대상으로 대화를 시작한다(사용자가 바꾸는 UI는 캘린더 슬라이스에서).
export type NextDayState =
  | { status: 'loading' }
  | { status: 'loaded'; nextDay: NextDay }
  | { status: 'error' };

export function useNextDay(routineId: string): NextDayState {
  const service = usePlanService();
  const [state, setState] = useState<NextDayState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void service.nextDay(routineId).then(
      (nextDay) => {
        if (alive) {
          setState({ status: 'loaded', nextDay });
        }
      },
      () => {
        if (alive) {
          setState({ status: 'error' });
        }
      },
    );

    return () => {
      alive = false;
    };
  }, [service, routineId]);

  return state;
}
