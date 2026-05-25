import { z } from 'zod';

// 스키마 값은 *Schema, 타입은 동명으로 둔다(z.infer 파생).
// 혼동 위험이 큰 값(날짜/시각, 엔티티 식별자)은 .brand()로 검증 통과분만 흐르게 한다.

export const ISODateSchema = z.string().date().brand<'ISODate'>(); // "2026-05-25"
export type ISODate = z.infer<typeof ISODateSchema>;

export const ISODateTimeSchema = z.string().datetime().brand<'ISODateTime'>(); // "2026-05-25T09:00:00Z"
export type ISODateTime = z.infer<typeof ISODateTimeSchema>;

export const RoutineIdSchema = z.string().brand<'RoutineId'>();
export type RoutineId = z.infer<typeof RoutineIdSchema>;

export const PlanIdSchema = z.string().brand<'PlanId'>();
export type PlanId = z.infer<typeof PlanIdSchema>;

// 근육군 (대체 운동·과부하 판단에 필요한 최소 분류)
export const MuscleGroupSchema = z.enum([
  'chest',
  'back',
  'shoulders',
  'legs',
  'glutes',
  'core',
  'biceps',
  'triceps',
]);
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;

// 분할 방식
export const SplitTypeSchema = z.enum([
  'full_body',
  'upper_lower',
  'push_pull_legs',
  'bro_split',
  'custom',
]);
export type SplitType = z.infer<typeof SplitTypeSchema>;

// 운동 목표 (근비대 / 근력 / 근지구력)
export const GoalSchema = z.enum(['hypertrophy', 'strength', 'endurance']);
export type Goal = z.infer<typeof GoalSchema>;

// 대화 메시지 (클라가 history로 전송)
export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
