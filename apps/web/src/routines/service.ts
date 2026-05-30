import type { Routine, RoutineDraft } from './repository';

// 루틴 use-case 경계 — react는 이 인터페이스만 의존한다(repository는 보지 않는다).
// 지금은 repository 위임에 가깝지만, 향후 대화 기반 생성·조합·클라 측 계산이 이 레이어에 흡수된다.
export interface RoutineService {
  list: () => Promise<Routine[]>;
  get: (id: string) => Promise<Routine>;
  create: (draft: RoutineDraft) => Promise<Routine>;
}
