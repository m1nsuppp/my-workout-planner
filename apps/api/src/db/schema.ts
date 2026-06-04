import { index, integer, primaryKey, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

// 사용자/세션. 신원 골격만 — OAuth provider 매핑은 (provider, provider_user_id)로 보유.
// 같은 email이라도 provider가 다르면 다른 신원이므로 email은 unique 아님.

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: text('email').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [unique().on(t.provider, t.providerUserId)],
);

// 서버 세션. sid(id)는 httpOnly 쿠키로만 오간다. 만료는 expiresAt(ISO)로 판단.
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(), // FK 미사용 — 무결성은 앱 레벨에서
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

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

// 계획(인스턴스) 계열. 루틴 템플릿을 특정 날짜에 적용한 스냅샷 + 실제 수행 기록.
// 계획=생성 시점 스냅샷 원칙: 표시에 필요한 값(routineDayLabel, planExercises.name)을 복사해 박는다.

export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(), // FK 미사용
    routineId: text('routine_id').notNull(), // 파생된 루틴(현재 위치 계산용)
    routineDayId: text('routine_day_id'), // 어느 Day(nullable: 루틴 수정/삭제 대비)
    routineDayLabel: text('routine_day_label').notNull(), // 표시용 스냅샷(루틴 수정돼도 불변)
    date: text('date').notNull(), // ISODate "2026-05-25"
    status: text('status').notNull().default('scheduled'), // scheduled|in_progress|completed
    overloadNote: text('overload_note'), // LLM 과부하 근거
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_plans_user_date').on(t.userId, t.date), // 캘린더/오늘 조회
    index('idx_plans_day_lookup').on(t.routineId, t.routineDayId, t.status, t.date), // 직전 동일 Day
  ],
);

export const planExercises = sqliteTable(
  'plan_exercises',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id').notNull(), // FK 미사용
    name: text('name').notNull(), // 스냅샷 복사본
    note: text('note'), // 운동 중 교체 등 한 줄 메모
    orderIndex: integer('order_index').notNull(),
  },
  (t) => [unique().on(t.planId, t.orderIndex)],
);

export const planExerciseMuscles = sqliteTable(
  'plan_exercise_muscles',
  {
    planExerciseId: text('plan_exercise_id').notNull(), // FK 미사용
    muscleGroup: text('muscle_group').notNull(),
  },
  (t) => [primaryKey({ columns: [t.planExerciseId, t.muscleGroup] })],
);

// 코치 변경안 적용 이력 = 멱등성 키 저장소. 같은 키의 재적용을 막아 delta 누적(0.8×0.8) 사고를 차단한다.
// idempotencyKey가 PK라 두 번째 적용은 PK 충돌 → 서비스가 409로 변환한다.
export const coachApplications = sqliteTable('coach_applications', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  planId: text('plan_id').notNull(), // FK 미사용 — 추적용
  appliedAt: text('applied_at').notNull(),
});

// 계획 세트 = 목표값 + (선택)실제 수행값. actual은 세트당 최대 1개라 컬럼으로 흡수.
export const plannedSets = sqliteTable(
  'planned_sets',
  {
    id: text('id').primaryKey(),
    planExerciseId: text('plan_exercise_id').notNull(), // FK 미사용
    orderIndex: integer('order_index').notNull(),
    targetWeightKg: real('target_weight_kg').notNull(),
    targetReps: integer('target_reps').notNull(),
    // 수행 기록(SetRecord). 미수행이면 NULL.
    actualWeightKg: real('actual_weight_kg'),
    actualReps: integer('actual_reps'),
    actualRir: integer('actual_rir'),
    completedAt: text('completed_at'),
  },
  (t) => [unique().on(t.planExerciseId, t.orderIndex)],
);
