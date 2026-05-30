import type { CreateRoutineRequestDto, ListRoutinesResponseDto } from '@workout/contracts';

// 경계 도메인 타입 — 지금은 contracts와 1:1이라 DTO에서 추출해 그대로 쓴다.
// 도메인이 계약과 갈라지는 시점에 매핑 함수를 도입한다(그 전엔 패스스루라 불필요).
export type Routine = Extract<ListRoutinesResponseDto, { ok: true }>['data'][number];
export type RoutineDraft = CreateRoutineRequestDto;

// 루틴 도메인의 사용처 관점 인터페이스. HTTP·봉투를 노출하지 않는다.
// 실패(미인증·없음·검증오류)는 ApiError로 던진다 — 값으로 숨기지 않는다.
export interface RoutineRepository {
  list: () => Promise<Routine[]>;
  get: (id: string) => Promise<Routine>;
  create: (draft: RoutineDraft) => Promise<Routine>;
}
