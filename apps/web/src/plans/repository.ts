import type {
  CreatePlanRequestDto,
  GetPlanResponseDto,
  NextDayResponseDto,
  PlanChatRequestDto,
  PlanChatResultDto,
  UpdatePlanStatusRequestDto,
  UpdateSetRequestDto,
} from '@workout/contracts';

// 경계 도메인 타입 — 지금은 contracts와 1:1이라 DTO에서 추출해 그대로 쓴다.
export type Plan = Extract<GetPlanResponseDto, { ok: true }>['data'];
export type PlanDraft = CreatePlanRequestDto;
export type PlannedSet = Plan['exercises'][number]['sets'][number];
export type NextDay = Extract<NextDayResponseDto, { ok: true }>['data'];
export type ChatMessage = PlanChatRequestDto['history'][number];
// 운동 실행에서 전이 가능한 상태(scheduled는 생성 시점 값이라 요청 불가).
export type PlanStatusUpdate = UpdatePlanStatusRequestDto['status'];
export type SetRecordInput = UpdateSetRequestDto;
// LLM의 다음 응답 — 질문(asking) 또는 계획 제안(proposing).
export type PlanProposal = PlanChatResultDto;

// 계획 생성 대화 입력. 화면이 URL/날짜에서 만든 평문 식별자를 그대로 싣는다(서버가 검증).
export interface PlanChatInput {
  routineId: string;
  routineDayLabel: string;
  date: string;
  history: ChatMessage[];
}

// 계획 도메인의 사용처 관점 인터페이스. HTTP·봉투를 노출하지 않는다.
// 실패(미인증·없음·검증오류·LLM)는 ApiError로 던진다 — 값으로 숨기지 않는다.
export interface PlanRepository {
  get: (id: string) => Promise<Plan>;
  create: (draft: PlanDraft) => Promise<Plan>;
  // 루틴의 다음 차례 Day 자동 제시(계획 생성 진입 시 기본 Day).
  nextDay: (routineId: string) => Promise<NextDay>;
  // 대화 한 턴 → 다음 응답. 성공은 봉투 없는 raw proposal, 실패만 봉투(ApiError).
  chat: (input: PlanChatInput) => Promise<PlanProposal>;
  // 운동 실행(S7) — 상태 전이(시작/종료), 세트 실제값 기록.
  updateStatus: (planId: string, status: PlanStatusUpdate) => Promise<Plan>;
  updateSet: (setId: string, record: SetRecordInput) => Promise<PlannedSet>;
}
