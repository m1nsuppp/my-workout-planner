import type {
  CreateRoutineRequestDto,
  ListRoutinesResponseDto,
  RoutineChatRequestDto,
  RoutineChatResultDto,
} from '@workout/contracts';

// 경계 도메인 타입 — 지금은 contracts와 1:1이라 DTO에서 추출해 그대로 쓴다.
// 도메인이 계약과 갈라지는 시점에 매핑 함수를 도입한다(그 전엔 패스스루라 불필요).
export type Routine = Extract<ListRoutinesResponseDto, { ok: true }>['data'][number];
export type RoutineDraft = CreateRoutineRequestDto;
export type ChatMessage = RoutineChatRequestDto['history'][number];
// LLM의 다음 응답 — 질문(asking) 또는 루틴 제안(proposing).
export type RoutineProposal = RoutineChatResultDto;

// 루틴 도메인의 사용처 관점 인터페이스. HTTP·봉투를 노출하지 않는다.
// 실패(미인증·없음·검증오류)는 ApiError로 던진다 — 값으로 숨기지 않는다.
export interface RoutineRepository {
  list: () => Promise<Routine[]>;
  get: (id: string) => Promise<Routine>;
  create: (draft: RoutineDraft) => Promise<Routine>;
  // 대화 기록을 보내 다음 응답을 받는다. message 토큰은 onDelta로 흘리고, 끝에 raw proposal을 돌려준다.
  // 실패는 ApiError로 던진다(미인증·검증오류·LLM).
  chat: (history: ChatMessage[], onDelta?: (text: string) => void) => Promise<RoutineProposal>;
}
