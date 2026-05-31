import { useEffect, useState } from 'react';
import { useRoutineService } from '../app/contexts/routine-service-context';
import type { Routine } from './repository';

// 루틴 목록 화면의 상태 기계 — service.list()를 감싸 UI가 분기할 4상태로 노출한다.
// UI 컴포넌트는 렌더만, 이 로직은 fake service 주입으로 단위 검증된다.
export type RoutinesState =
  | { status: 'loading'; routines: readonly Routine[] }
  | { status: 'empty'; routines: readonly Routine[] }
  | { status: 'loaded'; routines: readonly Routine[] }
  | { status: 'error'; routines: readonly Routine[] };

export function useRoutines(): RoutinesState {
  const service = useRoutineService();
  const [state, setState] = useState<RoutinesState>({ status: 'loading', routines: [] });

  useEffect(() => {
    let alive = true;
    void service.list().then(
      (routines) => {
        if (alive) {
          setState({ status: routines.length === 0 ? 'empty' : 'loaded', routines });
        }
      },
      () => {
        // 실패는 값으로 흡수하지 않고 error 상태로 노출(미로그인은 가드가 이미 차단해 여기 안 옴).
        if (alive) {
          setState({ status: 'error', routines: [] });
        }
      },
    );

    return () => {
      alive = false;
    };
  }, [service]);

  return state;
}
