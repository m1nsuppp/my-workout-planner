import { useEffect, useState } from 'react';
import { useRoutineService } from '../app/contexts/routine-service-context';
import { ApiResponseError } from '../shared/api-response-error';
import type { Routine } from './repository';

// 루틴 상세 화면의 상태 기계 — service.get(id)를 감싸 UI가 분기할 상태로 노출한다.
// 없는 루틴(404)은 일반 오류와 구분해 안내 문구를 다르게 줄 수 있게 notfound로 분리한다.
export type RoutineDetailState =
  | { status: 'loading' }
  | { status: 'loaded'; routine: Routine }
  | { status: 'notfound' }
  | { status: 'error' };

export function useRoutine(id: string): RoutineDetailState {
  const service = useRoutineService();
  const [state, setState] = useState<RoutineDetailState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void service.get(id).then(
      (routine) => {
        if (alive) {
          setState({ status: 'loaded', routine });
        }
      },
      (error: unknown) => {
        if (!alive) {
          return;
        }
        // 404만 notfound로 격하, 그 외(미인증·서버오류)는 error. 미로그인은 가드가 이미 차단.
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
