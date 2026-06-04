import { z } from 'zod';
import { ISODateSchema, MuscleGroupSchema, PlanIdSchema, RoutineIdSchema } from './common';

export const PlanStatusSchema = z.enum(['scheduled', 'in_progress', 'completed']);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

// 세션 수행 기록 — 점진적 과부하의 데이터 근거
export const SetRecordSchema = z.object({
  weightKg: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  rir: z.number().int().nonnegative(), // Reps In Reserve (남은 반복 수)
  completedAt: z.string().datetime(),
});
export type SetRecord = z.infer<typeof SetRecordSchema>;

// 계획 세트 = 목표값 + (선택)실제 수행값.
// 생성 시점(draft)엔 세트 id가 없고, 저장 후(record)엔 서버가 부여한 id가 붙는다.
// id는 운동 실행(S7)에서 PATCH /sets/:id 의 대상.
export const PlannedSetDraftSchema = z.object({
  targetWeightKg: z.number().nonnegative(),
  targetReps: z.number().int().positive(),
  actual: SetRecordSchema.optional(), // 미수행이면 undefined
});
export type PlannedSetDraft = z.infer<typeof PlannedSetDraftSchema>;

export const PlannedSetSchema = PlannedSetDraftSchema.extend({ id: z.string() });
export type PlannedSet = z.infer<typeof PlannedSetSchema>;

// 계획의 운동 = 구체 수치 확정 (무게 포함). draft는 세트 id 없음, record는 있음.
export const PlanExerciseDraftSchema = z.object({
  name: z.string(),
  muscleGroups: z.array(MuscleGroupSchema),
  sets: z.array(PlannedSetDraftSchema),
  note: z.string().optional(), // 운동 중 교체 등 한 줄 메모
});
export type PlanExerciseDraft = z.infer<typeof PlanExerciseDraftSchema>;

export const PlanExerciseSchema = PlanExerciseDraftSchema.extend({
  sets: z.array(PlannedSetSchema),
});
export type PlanExercise = z.infer<typeof PlanExerciseSchema>;

export const PlanSchema = z.object({
  id: PlanIdSchema,
  routineId: RoutineIdSchema,
  routineDayLabel: z.string(), // 생성 시점 스냅샷
  date: ISODateSchema,
  status: PlanStatusSchema,
  exercises: z.array(PlanExerciseSchema),
  overloadNote: z.string().optional(), // LLM 과부하 근거
  createdAt: z.string().datetime(),
});
export type Plan = z.infer<typeof PlanSchema>;

// 확정 전 계획 (id/status/createdAt은 서버가 부여, 세트도 아직 id 없음)
export const PlanDraftSchema = z.object({
  routineId: RoutineIdSchema,
  routineDayLabel: z.string(),
  date: ISODateSchema,
  exercises: z.array(PlanExerciseDraftSchema),
  overloadNote: z.string().optional(),
});
export type PlanDraft = z.infer<typeof PlanDraftSchema>;

// 캘린더/오늘 카드용 경량 요약
export const PlanSummarySchema = z.object({
  id: PlanIdSchema,
  date: ISODateSchema,
  status: PlanStatusSchema,
  routineDayLabel: z.string(),
  exerciseCount: z.number().int().nonnegative(),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

// 계획 생성 대화의 LLM 출력. RoutineProposal과 동일한 phase 패턴.
export const PlanProposalSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('asking'), message: z.string() }),
  z.object({ phase: z.literal('proposing'), message: z.string(), planDraft: PlanDraftSchema }),
]);
export type PlanProposal = z.infer<typeof PlanProposalSchema>;
