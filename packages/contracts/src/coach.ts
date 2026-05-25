import { z } from 'zod';
import { PlanExerciseSchema, PlannedSetSchema } from './plan';

// 운동 중 코치의 변경안.
// applying(진행 중 계획을 변형) vs advisory(변형 없음, 클라가 처리).

// [applying] 운동 교체 (자리 없음/장비 없음). reason을 replacement.note에 박아 흔적 남김
export const SubstituteExerciseSchema = z.object({
  kind: z.literal('substitute'),
  targetExerciseName: z.string(),
  replacement: PlanExerciseSchema, // 대체 운동 (동일 근육군 우선)
  reason: z.string(),
});
export type SubstituteExercise = z.infer<typeof SubstituteExerciseSchema>;

// [applying] 부하 하향 (컨디션 난조). delta 표현으로 "하향만"을 스키마 제약으로 강제.
// 상향(↑)은 운동 철학상 금지(다음 계획에서만).
export const AdjustLoadSchema = z.object({
  kind: z.literal('adjust_load'),
  targetExerciseName: z.string(),
  weightFactor: z.number().min(0.5).max(1), // 무게 배율. 예: 0.8 = 20% 감량 (하한 0.5)
  repsDelta: z.number().int().max(0).optional(), // 횟수 증감. 예: -2
  dropSets: z.number().int().min(0).optional(), // 남은 세트 수 줄이기 (적용 시 ≤ 남은 세트 수)
  reason: z.string(),
});
export type AdjustLoad = z.infer<typeof AdjustLoadSchema>;

// [advisory] 휴식 권유 — 타이머만, 영속 변경 없음
export const RestSchema = z.object({
  kind: z.literal('rest'),
  durationSec: z.number().int().positive(),
  reason: z.string(),
});
export type Rest = z.infer<typeof RestSchema>;

// [advisory] 조기 종료 — 실제 상태 전이는 상태 변경 경로에서 처리(책임 분리)
export const EndSessionSchema = z.object({
  kind: z.literal('end_session'),
  reason: z.string(),
});
export type EndSession = z.infer<typeof EndSessionSchema>;

export const CoachChangeSchema = z.discriminatedUnion('kind', [
  SubstituteExerciseSchema,
  AdjustLoadSchema,
  RestSchema,
  EndSessionSchema,
]);
export type CoachChange = z.infer<typeof CoachChangeSchema>;

// 적용 요청이 받는 applying 변경안만 (advisory는 클라가 처리)
export const ApplyableChangeSchema = z.discriminatedUnion('kind', [
  SubstituteExerciseSchema,
  AdjustLoadSchema,
]);
export type ApplyableChange = z.infer<typeof ApplyableChangeSchema>;

export const CoachResponseSchema = z.object({
  message: z.string(),
  change: CoachChangeSchema.nullable(), // 없으면(대화만) null
});
export type CoachResponse = z.infer<typeof CoachResponseSchema>;
