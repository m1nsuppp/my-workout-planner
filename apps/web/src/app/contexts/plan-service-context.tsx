import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { PlanService } from '../../plans/service';

// 계획 service를 react에 잇는 어댑터 — 도메인별로 분리해, 화면 테스트 시
// 다른 도메인 service까지 채울 필요 없이 이 Provider에 fake service 하나만 주면 된다.
const PlanServiceContext = createContext<PlanService | null>(null);

export function PlanServiceProvider({
  service,
  children,
}: {
  service: PlanService;
  children: ReactNode;
}): ReactElement {
  return <PlanServiceContext.Provider value={service}>{children}</PlanServiceContext.Provider>;
}

export function usePlanService(): PlanService {
  const service = useContext(PlanServiceContext);
  if (service === null) {
    throw new Error('PlanServiceProvider 밖에서 usePlanService를 사용할 수 없습니다.');
  }

  return service;
}
