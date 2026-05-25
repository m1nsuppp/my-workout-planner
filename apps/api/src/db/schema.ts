import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

// 루틴(템플릿) 계열. 순서 모델(orderIndex)로 소화. DB 스키마는 서버 내부(계약 아님).

export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  goal: text('goal').notNull(),
  splitType: text('split_type').notNull(),
  daysPerWeek: integer('days_per_week').notNull(),
  createdAt: text('created_at').notNull(),
});

export const routineDays = sqliteTable(
  'routine_days',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id').notNull(), // FK 미사용 — 무결성은 앱 레벨에서
    label: text('label').notNull(),
    orderIndex: integer('order_index').notNull(),
  },
  (t) => [unique().on(t.routineId, t.orderIndex)],
);

export const routineExercises = sqliteTable(
  'routine_exercises',
  {
    id: text('id').primaryKey(),
    routineDayId: text('routine_day_id').notNull(), // FK 미사용
    name: text('name').notNull(),
    targetSets: integer('target_sets').notNull(),
    targetRepMin: integer('target_rep_min').notNull(),
    targetRepMax: integer('target_rep_max').notNull(),
    orderIndex: integer('order_index').notNull(),
  },
  (t) => [unique().on(t.routineDayId, t.orderIndex)],
);

export const routineExerciseMuscles = sqliteTable(
  'routine_exercise_muscles',
  {
    routineExerciseId: text('routine_exercise_id').notNull(), // FK 미사용
    muscleGroup: text('muscle_group').notNull(),
  },
  (t) => [primaryKey({ columns: [t.routineExerciseId, t.muscleGroup] })],
);
