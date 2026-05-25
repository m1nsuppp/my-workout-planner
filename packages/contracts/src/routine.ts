import { z } from 'zod';
import { GoalSchema, MuscleGroupSchema, RoutineIdSchema, SplitTypeSchema } from './common';

// 루틴의 운동 = "목표 범위"만 가짐. 구체 수치는 계획에서 확정.
export const RoutineExerciseSchema = z.object({
  name: z.string(),
  muscleGroups: z.array(MuscleGroupSchema),
  targetSets: z.number().int().positive(),
  targetRepRange: z.tuple([z.number().int().positive(), z.number().int().positive()]),
});
export type RoutineExercise = z.infer<typeof RoutineExerciseSchema>;

// 분할의 각 "날". 요일 고정이 아니라 순서(배열 인덱스)로 소화한다.
export const RoutineDaySchema = z.object({
  label: z.string(), // "상체 A"
  exercises: z.array(RoutineExerciseSchema),
});
export type RoutineDay = z.infer<typeof RoutineDaySchema>;

export const RoutineSchema = z.object({
  id: RoutineIdSchema,
  name: z.string(),
  goal: GoalSchema,
  splitType: SplitTypeSchema,
  daysPerWeek: z.number().int().positive(), // 목표 빈도(강제 배치 X)
  days: z.array(RoutineDaySchema),
  createdAt: z.string().datetime(),
});
export type Routine = z.infer<typeof RoutineSchema>;

// id/createdAt 없는 Routine (확정 시 서버가 부여)
export const RoutineDraftSchema = RoutineSchema.omit({ id: true, createdAt: true });
export type RoutineDraft = z.infer<typeof RoutineDraftSchema>;

// 루틴 생성 대화의 LLM 출력. phase로 단계를 명시(asking=정보 수집, proposing=확정 가능).
export const RoutineProposalSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('asking'), message: z.string() }),
  z.object({ phase: z.literal('proposing'), message: z.string(), routine: RoutineDraftSchema }),
]);
export type RoutineProposal = z.infer<typeof RoutineProposalSchema>;
