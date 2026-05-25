import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { routineDays, routineExerciseMuscles, routineExercises, routines } from '../db/schema';
import type { NewRoutine, RoutineRecord, RoutineRepository } from './repository';

type Db = DrizzleD1Database;

const newId = (): string => crypto.randomUUID();

export function createD1RoutineRepository(d1: D1Database): RoutineRepository {
  const db = drizzle(d1);

  return {
    create: async (userId, routine) => await insert(db, userId, routine),
    list: async (userId) => {
      const rows = await db
        .select()
        .from(routines)
        .where(eq(routines.userId, userId))
        .orderBy(routines.createdAt);

      return await Promise.all(rows.map(async (row) => await hydrate(db, row)));
    },
    findById: async (userId, id) => {
      const row = await db
        .select()
        .from(routines)
        .where(and(eq(routines.id, id), eq(routines.userId, userId)))
        .get();

      return row === undefined ? null : await hydrate(db, row);
    },
  };
}

type RoutineRow = typeof routines.$inferSelect;

async function insert(db: Db, userId: string, routine: NewRoutine): Promise<RoutineRecord> {
  const id = newId();
  const createdAt = new Date().toISOString();

  const dayValues: Array<typeof routineDays.$inferInsert> = [];
  const exerciseValues: Array<typeof routineExercises.$inferInsert> = [];
  const muscleValues: Array<typeof routineExerciseMuscles.$inferInsert> = [];

  routine.days.forEach((day, dayIndex) => {
    const dayId = newId();
    dayValues.push({ id: dayId, routineId: id, label: day.label, orderIndex: dayIndex });
    day.exercises.forEach((ex, exIndex) => {
      const exId = newId();
      exerciseValues.push({
        id: exId,
        routineDayId: dayId,
        name: ex.name,
        targetSets: ex.targetSets,
        targetRepMin: ex.targetRepRange[0],
        targetRepMax: ex.targetRepRange[1],
        orderIndex: exIndex,
      });
      for (const muscle of ex.muscleGroups) {
        muscleValues.push({ routineExerciseId: exId, muscleGroup: muscle });
      }
    });
  });

  // 루틴 insert는 항상 존재하므로 첫 항목으로 두면 db.batch의 비어있지 않은 튜플 타입을 캐스팅 없이 만족한다.
  const head = db.insert(routines).values({
    id,
    userId,
    name: routine.name,
    goal: routine.goal,
    splitType: routine.splitType,
    daysPerWeek: routine.daysPerWeek,
    createdAt,
  });
  const rest: Array<BatchItem<'sqlite'>> = [];
  if (dayValues.length > 0) {
    rest.push(db.insert(routineDays).values(dayValues));
  }
  if (exerciseValues.length > 0) {
    rest.push(db.insert(routineExercises).values(exerciseValues));
  }
  if (muscleValues.length > 0) {
    rest.push(db.insert(routineExerciseMuscles).values(muscleValues));
  }

  await db.batch([head, ...rest]);

  return { id, createdAt, ...routine };
}

// 한 루틴의 days/exercises/muscles를 읽어 중첩 구조로 복원.
async function hydrate(db: Db, row: RoutineRow): Promise<RoutineRecord> {
  const days = await db
    .select()
    .from(routineDays)
    .where(eq(routineDays.routineId, row.id))
    .orderBy(routineDays.orderIndex);

  const dayIds = days.map((d) => d.id);
  const exercises =
    dayIds.length > 0
      ? await db
          .select()
          .from(routineExercises)
          .where(inArray(routineExercises.routineDayId, dayIds))
          .orderBy(routineExercises.orderIndex)
      : [];

  const exerciseIds = exercises.map((e) => e.id);
  const muscles =
    exerciseIds.length > 0
      ? await db
          .select()
          .from(routineExerciseMuscles)
          .where(inArray(routineExerciseMuscles.routineExerciseId, exerciseIds))
      : [];

  const musclesByExercise = new Map<string, string[]>();
  for (const m of muscles) {
    const list = musclesByExercise.get(m.routineExerciseId) ?? [];
    list.push(m.muscleGroup);
    musclesByExercise.set(m.routineExerciseId, list);
  }

  return {
    id: row.id,
    name: row.name,
    goal: row.goal,
    splitType: row.splitType,
    daysPerWeek: row.daysPerWeek,
    createdAt: row.createdAt,
    days: days.map((day) => ({
      label: day.label,
      exercises: exercises
        .filter((e) => e.routineDayId === day.id)
        .map((e) => ({
          name: e.name,
          muscleGroups: musclesByExercise.get(e.id) ?? [],
          targetSets: e.targetSets,
          targetRepRange: [e.targetRepMin, e.targetRepMax] as [number, number],
        })),
    })),
  };
}
