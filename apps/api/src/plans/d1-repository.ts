import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { planExerciseMuscles, planExercises, plannedSets, plans } from '../db/schema';
import type { NewPlan, PlanRecord, PlanRepository } from './repository';

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
  };
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
  const rest: Array<BatchItem<'sqlite'>> = [];
  if (exerciseValues.length > 0) {
    rest.push(db.insert(planExercises).values(exerciseValues));
  }
  if (muscleValues.length > 0) {
    rest.push(db.insert(planExerciseMuscles).values(muscleValues));
  }
  if (setValues.length > 0) {
    rest.push(db.insert(plannedSets).values(setValues));
  }

  await db.batch([head, ...rest]);

  return { id, status, createdAt, ...plan };
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
