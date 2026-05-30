import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { RoutineService } from '../../routines/service';

// 루틴 service를 react에 잇는 어댑터 — 도메인별로 분리해, 화면 테스트 시
// 다른 도메인 service까지 채울 필요 없이 이 Provider에 fake service 하나만 주면 된다.
const RoutineServiceContext = createContext<RoutineService | null>(null);

export function RoutineServiceProvider({
  service,
  children,
}: {
  service: RoutineService;
  children: ReactNode;
}): ReactElement {
  return (
    <RoutineServiceContext.Provider value={service}>{children}</RoutineServiceContext.Provider>
  );
}

export function useRoutineService(): RoutineService {
  const service = useContext(RoutineServiceContext);
  if (service === null) {
    throw new Error('RoutineServiceProvider 밖에서 useRoutineService를 사용할 수 없습니다.');
  }

  return service;
}
