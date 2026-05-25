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

// 계획 세트 = 목표값 + (선택)실제 수행값
export const PlannedSetSchema = z.object({
  targetWeightKg: z.number().nonnegative(),
  targetReps: z.number().int().positive(),
  actual: SetRecordSchema.optional(), // 미수행이면 undefined
});
export type PlannedSet = z.infer<typeof PlannedSetSchema>;

// 계획의 운동 = 구체 수치 확정 (무게 포함)
export const PlanExerciseSchema = z.object({
  name: z.string(),
  muscleGroups: z.array(MuscleGroupSchema),
  sets: z.array(PlannedSetSchema),
  note: z.string().optional(), // 운동 중 교체 등 한 줄 메모
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

// 확정 전 계획 (id/status/createdAt은 서버가 부여)
export const PlanDraftSchema = PlanSchema.omit({ id: true, status: true, createdAt: true });
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
