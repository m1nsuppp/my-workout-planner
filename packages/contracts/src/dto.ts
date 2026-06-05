import { z } from 'zod';
import { ChatMessageSchema, ISODateSchema, RoutineIdSchema } from './common';
import { RoutineSchema, RoutineDraftSchema, RoutineProposalSchema } from './routine';
import {
  PlanSchema,
  PlanDraftSchema,
  PlanSummarySchema,
  PlanProposalSchema,
  PlannedSetSchema,
} from './plan';
import { ApplyableChangeSchema, CoachResponseSchema } from './coach';
import { createApiResponseSchema } from './envelope';

// 이 패키지의 유일한 공개 표면 = 엔드포인트 계약.
// - *RequestDto  : 요청 본문 (클라가 아는 것만)
// - *ResponseDto : 봉투(ok/data|error)로 감싼 응답
// - *ResultDto   : 스트리밍 대화의 최종 페이로드 (봉투 없이 raw)
// 구성 블록(Routine/Plan 등)·값 타입은 내부 부품으로 숨긴다. BE/FE는 경계에서 자기 도메인으로 매핑한다.

const historyInput = z.object({ history: z.array(ChatMessageSchema) });

// ── 인증 ───────────────────────────────
// 현재 로그인 사용자. email은 표시용, id는 안정적 식별자. 세션(sid)은 httpOnly 쿠키라 계약에 없다.
export const MeResponseDto = createApiResponseSchema(
  z.object({ id: z.string(), email: z.string() }),
);
export type MeResponseDto = z.infer<typeof MeResponseDto>;

// ── 루틴 ───────────────────────────────
export const RoutineChatRequestDto = historyInput;
export type RoutineChatRequestDto = z.infer<typeof RoutineChatRequestDto>;

export const RoutineChatResultDto = RoutineProposalSchema;
export type RoutineChatResultDto = z.infer<typeof RoutineChatResultDto>;

export const CreateRoutineRequestDto = RoutineDraftSchema;
export type CreateRoutineRequestDto = z.infer<typeof CreateRoutineRequestDto>;

export const CreateRoutineResponseDto = createApiResponseSchema(RoutineSchema);
export type CreateRoutineResponseDto = z.infer<typeof CreateRoutineResponseDto>;

export const ListRoutinesResponseDto = createApiResponseSchema(z.array(RoutineSchema));
export type ListRoutinesResponseDto = z.infer<typeof ListRoutinesResponseDto>;

export const GetRoutineResponseDto = createApiResponseSchema(RoutineSchema);
export type GetRoutineResponseDto = z.infer<typeof GetRoutineResponseDto>;

// ── 계획 ───────────────────────────────
export const ListPlansResponseDto = createApiResponseSchema(z.array(PlanSummarySchema));
export type ListPlansResponseDto = z.infer<typeof ListPlansResponseDto>;

export const NextDayResponseDto = createApiResponseSchema(
  z.object({ routineDayId: z.string(), label: z.string() }),
);
export type NextDayResponseDto = z.infer<typeof NextDayResponseDto>;

// 계획 생성 진입 시드 초안 — Day 템플릿 + 직전 과부하로 서버가 결정적으로 채운 카드(LLM 없음).
// 첫 수행 운동은 무게 0으로 채워 사용자/대화가 마저 정한다.
export const PlanDraftResponseDto = createApiResponseSchema(PlanDraftSchema);
export type PlanDraftResponseDto = z.infer<typeof PlanDraftResponseDto>;

// 계획 생성 대화 요청 — 과부하·템플릿은 서버가 DB에서 조립하고, 클라는 식별자 + 현재 카드 상태(draft)를 보낸다.
// draft는 사용자가 편집 중인 최신 카드 → 모델이 이를 수정해 돌려준다(하이브리드 카드).
export const PlanChatRequestDto = z.object({
  routineId: RoutineIdSchema,
  routineDayLabel: z.string(),
  date: ISODateSchema,
  draft: PlanDraftSchema,
  history: z.array(ChatMessageSchema),
});
export type PlanChatRequestDto = z.infer<typeof PlanChatRequestDto>;

export const PlanChatResultDto = PlanProposalSchema;
export type PlanChatResultDto = z.infer<typeof PlanChatResultDto>;

export const CreatePlanRequestDto = PlanDraftSchema;
export type CreatePlanRequestDto = z.infer<typeof CreatePlanRequestDto>;

export const CreatePlanResponseDto = createApiResponseSchema(PlanSchema);
export type CreatePlanResponseDto = z.infer<typeof CreatePlanResponseDto>;

export const GetPlanResponseDto = createApiResponseSchema(PlanSchema);
export type GetPlanResponseDto = z.infer<typeof GetPlanResponseDto>;

// 상태 전이 요청 — scheduled는 생성 시점 값이라 요청으로 못 보냄(역전이 금지).
export const UpdatePlanStatusRequestDto = z.object({
  status: z.enum(['in_progress', 'completed']),
});
export type UpdatePlanStatusRequestDto = z.infer<typeof UpdatePlanStatusRequestDto>;

// ── 운동 실행 / 코치 ───────────────────
export const UpdateSetRequestDto = z.object({
  weightKg: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  rir: z.number().int().nonnegative(),
});
export type UpdateSetRequestDto = z.infer<typeof UpdateSetRequestDto>;

export const UpdateSetResponseDto = createApiResponseSchema(PlannedSetSchema);
export type UpdateSetResponseDto = z.infer<typeof UpdateSetResponseDto>;

export const CoachRequestDto = historyInput;
export type CoachRequestDto = z.infer<typeof CoachRequestDto>;

export const CoachResultDto = CoachResponseSchema;
export type CoachResultDto = z.infer<typeof CoachResultDto>;

export const CoachApplyRequestDto = z.object({
  change: ApplyableChangeSchema,
  idempotencyKey: z.string(),
});
export type CoachApplyRequestDto = z.infer<typeof CoachApplyRequestDto>;

export const CoachApplyResponseDto = createApiResponseSchema(PlanSchema);
export type CoachApplyResponseDto = z.infer<typeof CoachApplyResponseDto>;
