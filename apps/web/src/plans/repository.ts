import type {
  CoachApplyRequestDto,
  CoachResultDto,
  CreatePlanRequestDto,
  GetPlanResponseDto,
  ListPlansResponseDto,
  NextDayResponseDto,
  PlanChatRequestDto,
  PlanChatResultDto,
  UpdatePlanStatusRequestDto,
  UpdateSetRequestDto,
} from '@workout/contracts';

// 경계 도메인 타입 — 지금은 contracts와 1:1이라 DTO에서 추출해 그대로 쓴다.
export type Plan = Extract<GetPlanResponseDto, { ok: true }>['data'];
// 목록/홈용 경량 요약(상세 exercises 없이 운동 개수만).
export type PlanSummary = Extract<ListPlansResponseDto, { ok: true }>['data'][number];
// 목록 조회 기간(둘 다 선택).
export interface PlanDateRange {
  from?: string;
  to?: string;
}
export type PlanDraft = CreatePlanRequestDto;
export type PlannedSet = Plan['exercises'][number]['sets'][number];
export type NextDay = Extract<NextDayResponseDto, { ok: true }>['data'];
export type ChatMessage = PlanChatRequestDto['history'][number];
// 운동 실행에서 전이 가능한 상태(scheduled는 생성 시점 값이라 요청 불가).
export type PlanStatusUpdate = UpdatePlanStatusRequestDto['status'];
export type SetRecordInput = UpdateSetRequestDto;
// LLM의 다음 응답 — 질문(asking) 또는 계획 제안(proposing).
export type PlanProposal = PlanChatResultDto;
// 운동 중 코치의 응답(message + 변경안|null)과 변경안 타입.
export type CoachResponse = CoachResultDto;
export type CoachChange = NonNullable<CoachResultDto['change']>;
// 적용 가능한 변경안(applying: substitute/adjust_load만). advisory(rest/end_session)는 클라가 처리.
export type ApplyableChange = CoachApplyRequestDto['change'];

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
  // 기간 내 계획 요약 목록(날짜 오름차순). range 없으면 전체.
  list: (range?: PlanDateRange) => Promise<PlanSummary[]>;
  create: (draft: PlanDraft) => Promise<Plan>;
  // 루틴의 다음 차례 Day 자동 제시(계획 생성 진입 시 기본 Day).
  nextDay: (routineId: string) => Promise<NextDay>;
  // 대화 한 턴 → 다음 응답. message 토큰은 onDelta로 흘리고, 끝에 raw proposal을 돌려준다. 실패는 ApiError.
  chat: (input: PlanChatInput, onDelta?: (text: string) => void) => Promise<PlanProposal>;
  // 운동 실행(S7) — 상태 전이(시작/종료), 세트 실제값 기록.
  updateStatus: (planId: string, status: PlanStatusUpdate) => Promise<Plan>;
  updateSet: (setId: string, record: SetRecordInput) => Promise<PlannedSet>;
  // 운동 중 코치(S8) — 묻기(SSE, message 토큰을 onDelta로 흘림)와 변경안 적용(영속).
  coach: (
    planId: string,
    history: ChatMessage[],
    onDelta?: (text: string) => void,
  ) => Promise<CoachResponse>;
  applyCoach: (
    planId: string,
    change: ApplyableChange,
    idempotencyKey: string,
  ) => Promise<Plan>;
}
