import { and, asc, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { chunkedInserts } from '../db/chunked-insert';
import {
  coachApplications,
  planExerciseMuscles,
  planExercises,
  plannedSets,
  plans,
  routineDays,
  routines,
} from '../db/schema';
import type { NewPlan, PlanExerciseRecord, PlanRecord, PlanRepository } from './repository';

type Db = DrizzleD1Database;

const newId = (): string => crypto.randomUUID();

export function createD1PlanRepository(d1: D1Database): PlanRepository {
  const db = drizzle(d1);

  return {
    create: async (userId, plan) => await insert(db, userId, plan),
    findById: async (userId, id) => {
      const row = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, id), eq(plans.userId, userId)))
        .get();

      return row === undefined ? null : await hydrate(db, row);
    },
    listSummaries: async (userId, range) => {
      const filters = [eq(plans.userId, userId)];
      if (range?.from !== undefined) {
        filters.push(gte(plans.date, range.from));
      }
      if (range?.to !== undefined) {
        filters.push(lte(plans.date, range.to));
      }

      const rows = await db
        .select({
          id: plans.id,
          date: plans.date,
          status: plans.status,
          routineDayLabel: plans.routineDayLabel,
        })
        .from(plans)
        .where(and(...filters))
        .orderBy(asc(plans.date));
      if (rows.length === 0) {
        return [];
      }

      // 운동 개수는 plan_exercises를 plan별로 집계(N+1 회피). 운동 없는 계획은 0.
      const counts = await db
        .select({ planId: planExercises.planId, n: count() })
        .from(planExercises)
        .where(
          inArray(
            planExercises.planId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(planExercises.planId);
      const countByPlan = new Map(counts.map((c) => [c.planId, c.n]));

      return rows.map((r) => ({ ...r, exerciseCount: countByPlan.get(r.id) ?? 0 }));
    },
    nextDay: async (userId, routineId) => {
      // routine_days엔 userId가 없으므로 routines와 join해 소유권을 격리한다(타 유저 루틴이면 빈 배열).
      const days = await db
        .select({ id: routineDays.id, label: routineDays.label, orderIndex: routineDays.orderIndex })
        .from(routineDays)
        .innerJoin(routines, eq(routineDays.routineId, routines.id))
        .where(and(eq(routineDays.routineId, routineId), eq(routines.userId, userId)))
        .orderBy(routineDays.orderIndex);
      if (days.length === 0) {
        return null;
      }

      const last = await db
        .select({ routineDayId: plans.routineDayId })
        .from(plans)
        .where(
          and(
            eq(plans.userId, userId),
            eq(plans.routineId, routineId),
            eq(plans.status, 'completed'),
          ),
        )
        .orderBy(desc(plans.date))
        .get();

      // 마지막 완료 Day의 다음 인덱스(한 바퀴 돌면 처음으로). 이력이 없거나 그 Day가 사라졌으면 첫 Day.
      let nextIndex = 0;
      if (last !== undefined && last.routineDayId !== null) {
        const lastIndex = days.findIndex((d) => d.id === last.routineDayId);
        if (lastIndex !== -1) {
          nextIndex = (lastIndex + 1) % days.length;
        }
      }
      const day = days[nextIndex];

      return { routineDayId: day.id, label: day.label, orderIndex: day.orderIndex };
    },
    lastOverload: async (userId, routineId, routineDayId) => {
      const last = await db
        .select({ id: plans.id })
        .from(plans)
        .where(
          and(
            eq(plans.userId, userId),
            eq(plans.routineId, routineId),
            eq(plans.routineDayId, routineDayId),
            eq(plans.status, 'completed'),
          ),
        )
        .orderBy(desc(plans.date))
        .get();
      if (last === undefined) {
        return [];
      }

      const exercises = await db
        .select()
        .from(planExercises)
        .where(eq(planExercises.planId, last.id))
        .orderBy(planExercises.orderIndex);
      if (exercises.length === 0) {
        return [];
      }

      const sets = await db
        .select()
        .from(plannedSets)
        .where(
          inArray(
            plannedSets.planExerciseId,
            exercises.map((e) => e.id),
          ),
        )
        .orderBy(plannedSets.orderIndex);

      return exercises.map((e) => ({
        exerciseName: e.name,
        // 실제 수행분(completedAt 있는 세트)만 과부하 근거로 싣는다.
        sets: sets.flatMap((s) =>
          s.planExerciseId === e.id && s.completedAt !== null
            ? [
                {
                  weightKg: s.actualWeightKg ?? 0,
                  reps: s.actualReps ?? 0,
                  rir: s.actualRir ?? 0,
                  completedAt: s.completedAt,
                },
              ]
            : [],
        ),
      }));
    },
    findDayId: async (userId, routineId, label) => {
      const row = await db
        .select({ id: routineDays.id })
        .from(routineDays)
        .innerJoin(routines, eq(routineDays.routineId, routines.id))
        .where(
          and(
            eq(routineDays.routineId, routineId),
            eq(routines.userId, userId),
            eq(routineDays.label, label),
          ),
        )
        .get();

      return row?.id ?? null;
    },
    updateStatus: async (userId, id, status) => {
      const updated = await db
        .update(plans)
        .set({ status })
        .where(and(eq(plans.id, id), eq(plans.userId, userId)))
        .returning();
      if (updated.length === 0) {
        return null;
      }

      return await hydrate(db, updated[0]);
    },
    updateSet: async (userId, setId, actual) => {
      // 소유권 확인 — planned_sets는 userId가 없으므로 plan_exercises·plans를 거쳐 검사한다.
      const owner = await db
        .select({ id: plannedSets.id })
        .from(plannedSets)
        .innerJoin(planExercises, eq(plannedSets.planExerciseId, planExercises.id))
        .innerJoin(plans, eq(planExercises.planId, plans.id))
        .where(and(eq(plannedSets.id, setId), eq(plans.userId, userId)))
        .get();
      if (owner === undefined) {
        return null;
      }

      const updated = await db
        .update(plannedSets)
        .set({
          actualWeightKg: actual.weightKg,
          actualReps: actual.reps,
          actualRir: actual.rir,
          completedAt: actual.completedAt,
        })
        .where(eq(plannedSets.id, setId))
        .returning();
      const row = updated[0];

      return {
        id: row.id,
        targetWeightKg: row.targetWeightKg,
        targetReps: row.targetReps,
        actual: {
          weightKg: row.actualWeightKg ?? actual.weightKg,
          reps: row.actualReps ?? actual.reps,
          rir: row.actualRir ?? actual.rir,
          completedAt: row.completedAt ?? actual.completedAt,
        },
      };
    },
    applyCoachChange: async (userId, planId, apply) => {
      const plan = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
        .get();
      if (plan === undefined) {
        return null;
      }

      // 멱등성 — 같은 키가 이미 쓰였으면 중복 적용이므로 거부(delta 누적 방지). PK가 최종 방어선.
      const seen = await db
        .select({ key: coachApplications.idempotencyKey })
        .from(coachApplications)
        .where(eq(coachApplications.idempotencyKey, apply.idempotencyKey))
        .get();
      if (seen !== undefined) {
        return 'conflict';
      }

      await replaceExercises(db, planId, apply.exercises, {
        idempotencyKey: apply.idempotencyKey,
        appliedAt: apply.appliedAt,
      });

      return await hydrate(db, plan);
    },
  };
}

// plan의 운동/근육군/세트를 통째 갈아끼우고 멱등성 키를 같은 배치(원자적)로 기록한다.
// 세트 id는 인자로 받은 값을 보존한다 — adjust_load는 기존 세트 id 유지, substitute는 새 세트 id가 와 있다.
async function replaceExercises(
  db: Db,
  planId: string,
  exercises: PlanExerciseRecord[],
  application: { idempotencyKey: string; appliedAt: string },
): Promise<void> {
  const oldExercises = await db
    .select({ id: planExercises.id })
    .from(planExercises)
    .where(eq(planExercises.planId, planId));
  const oldIds = oldExercises.map((e) => e.id);

  const exerciseValues: Array<typeof planExercises.$inferInsert> = [];
  const muscleValues: Array<typeof planExerciseMuscles.$inferInsert> = [];
  const setValues: Array<typeof plannedSets.$inferInsert> = [];

  exercises.forEach((ex, exIndex) => {
    const exId = newId(); // 운동 행 id는 도메인에 노출되지 않으므로 재발급한다.
    exerciseValues.push({ id: exId, planId, name: ex.name, note: ex.note, orderIndex: exIndex });
    for (const muscle of ex.muscleGroups) {
      muscleValues.push({ planExerciseId: exId, muscleGroup: muscle });
    }
    ex.sets.forEach((set, setIndex) => {
      setValues.push({
        id: set.id, // 세트 id는 보존(PATCH /sets/:id 대상).
        planExerciseId: exId,
        orderIndex: setIndex,
        targetWeightKg: set.targetWeightKg,
        targetReps: set.targetReps,
        actualWeightKg: set.actual?.weightKg,
        actualReps: set.actual?.reps,
        actualRir: set.actual?.rir,
        completedAt: set.actual?.completedAt,
      });
    });
  });

  // 멱등성 키 insert를 첫 항목으로 둬 비어있지 않은 배치 튜플을 만족시키고, 같은 트랜잭션에서 변형을 반영한다.
  const head = db.insert(coachApplications).values({ ...application, planId });
  const rest: Array<BatchItem<'sqlite'>> = [];
  if (oldIds.length > 0) {
    rest.push(db.delete(plannedSets).where(inArray(plannedSets.planExerciseId, oldIds)));
    rest.push(
      db.delete(planExerciseMuscles).where(inArray(planExerciseMuscles.planExerciseId, oldIds)),
    );
  }
  rest.push(db.delete(planExercises).where(eq(planExercises.planId, planId)));
  // D1 변수 한도(100/쿼리)를 넘지 않도록 큰 INSERT는 청크로 쪼갠다.
  rest.push(...chunkedInserts(exerciseValues, (c) => db.insert(planExercises).values(c)));
  rest.push(...chunkedInserts(muscleValues, (c) => db.insert(planExerciseMuscles).values(c)));
  rest.push(...chunkedInserts(setValues, (c) => db.insert(plannedSets).values(c)));

  await db.batch([head, ...rest]);
}

type PlanRow = typeof plans.$inferSelect;

async function insert(db: Db, userId: string, plan: NewPlan): Promise<PlanRecord> {
  const id = newId();
  const createdAt = new Date().toISOString();
  const status = 'scheduled';

  const exerciseValues: Array<typeof planExercises.$inferInsert> = [];
  const muscleValues: Array<typeof planExerciseMuscles.$inferInsert> = [];
  const setValues: Array<typeof plannedSets.$inferInsert> = [];

  plan.exercises.forEach((ex, exIndex) => {
    const exId = newId();
    exerciseValues.push({ id: exId, planId: id, name: ex.name, note: ex.note, orderIndex: exIndex });
    for (const muscle of ex.muscleGroups) {
      muscleValues.push({ planExerciseId: exId, muscleGroup: muscle });
    }
    ex.sets.forEach((set, setIndex) => {
      setValues.push({
        id: newId(),
        planExerciseId: exId,
        orderIndex: setIndex,
        targetWeightKg: set.targetWeightKg,
        targetReps: set.targetReps,
        actualWeightKg: set.actual?.weightKg,
        actualReps: set.actual?.reps,
        actualRir: set.actual?.rir,
        completedAt: set.actual?.completedAt,
      });
    });
  });

  // plan insert는 항상 존재하므로 첫 항목으로 두면 db.batch의 비어있지 않은 튜플 타입을 캐스팅 없이 만족한다.
  const head = db.insert(plans).values({
    id,
    userId,
    routineId: plan.routineId,
    routineDayId: plan.routineDayId,
    routineDayLabel: plan.routineDayLabel,
    date: plan.date,
    status,
    overloadNote: plan.overloadNote,
    createdAt,
  });
  // D1 변수 한도(100/쿼리)를 넘지 않도록 큰 INSERT는 청크로 쪼갠다.
  const rest: Array<BatchItem<'sqlite'>> = [
    ...chunkedInserts(exerciseValues, (c) => db.insert(planExercises).values(c)),
    ...chunkedInserts(muscleValues, (c) => db.insert(planExerciseMuscles).values(c)),
    ...chunkedInserts(setValues, (c) => db.insert(plannedSets).values(c)),
  ];

  await db.batch([head, ...rest]);

  // 저장 후 복원해 돌려준다 — 세트마다 부여된 id까지 포함된 PlanRecord가 된다.
  const row = await db.select().from(plans).where(eq(plans.id, id)).get();
  if (row === undefined) {
    throw new Error('방금 생성한 계획을 찾지 못했습니다.');
  }

  return await hydrate(db, row);
}

// 한 계획의 exercises/muscles/sets를 읽어 중첩 구조로 복원. null인 optional은 undefined로 정규화.
async function hydrate(db: Db, row: PlanRow): Promise<PlanRecord> {
  const exercises = await db
    .select()
    .from(planExercises)
    .where(eq(planExercises.planId, row.id))
    .orderBy(planExercises.orderIndex);

  const exerciseIds = exercises.map((e) => e.id);
  const [muscles, sets] =
    exerciseIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(planExerciseMuscles)
            .where(inArray(planExerciseMuscles.planExerciseId, exerciseIds)),
          db
            .select()
            .from(plannedSets)
            .where(inArray(plannedSets.planExerciseId, exerciseIds))
            .orderBy(plannedSets.orderIndex),
        ])
      : [[], []];

  const musclesByExercise = new Map<string, string[]>();
  for (const m of muscles) {
    const list = musclesByExercise.get(m.planExerciseId) ?? [];
    list.push(m.muscleGroup);
    musclesByExercise.set(m.planExerciseId, list);
  }

  return {
    id: row.id,
    status: row.status,
    routineId: row.routineId,
    routineDayId: row.routineDayId ?? undefined,
    routineDayLabel: row.routineDayLabel,
    date: row.date,
    overloadNote: row.overloadNote ?? undefined,
    createdAt: row.createdAt,
    exercises: exercises.map((e) => ({
      name: e.name,
      note: e.note ?? undefined,
      muscleGroups: musclesByExercise.get(e.id) ?? [],
      sets: sets
        .filter((s) => s.planExerciseId === e.id)
        .map((s) => ({
          id: s.id,
          targetWeightKg: s.targetWeightKg,
          targetReps: s.targetReps,
          actual:
            s.completedAt === null
              ? undefined
              : {
                  weightKg: s.actualWeightKg ?? 0,
                  reps: s.actualReps ?? 0,
                  rir: s.actualRir ?? 0,
                  completedAt: s.completedAt,
                },
        })),
    })),
  };
}
