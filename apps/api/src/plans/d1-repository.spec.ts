import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import { plans } from '../db/schema';
import { createD1RoutineRepository } from '../routines/d1-repository';
import { createD1PlanRepository } from './d1-repository';
import type { NewPlan, PlanRecord, RoutineDayRef } from './repository';

const sample: NewPlan = {
  routineId: 'r1',
  routineDayId: 'd1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  overloadNote: '지난 벤치 RIR 2 → 2.5kg 증량',
  exercises: [
    {
      name: '벤치프레스',
      muscleGroups: ['chest', 'triceps'],
      sets: [
        { targetWeightKg: 52.5, targetReps: 8 },
        { targetWeightKg: 52.5, targetReps: 8 },
        {
          targetWeightKg: 52.5,
          targetReps: 8,
          actual: { weightKg: 52.5, reps: 8, rir: 2, completedAt: '2026-05-25T10:00:00.000Z' },
        },
      ],
    },
    {
      name: '랫풀다운',
      muscleGroups: ['back'],
      note: '교체(랫풀다운 → 어시스트 풀업)',
      sets: [{ targetWeightKg: 40, targetReps: 12 }],
    },
  ],
};

// muscleGroups는 순서 없는 집합 — 비교 시 정렬해 정규화한다(운동·세트 순서는 보존 대상이라 그대로).
const normalize = (p: PlanRecord): PlanRecord => ({
  ...p,
  exercises: p.exercises.map((e) => ({ ...e, muscleGroups: [...e.muscleGroups].sort() })),
});

describe('createD1PlanRepository (실제 D1)', () => {
  it('create → findById 왕복이 무손실이다 (4테이블 분해→복원, 목표·실제값 포함)', async () => {
    const repo = createD1PlanRepository(env.DB);
    const created = await repo.create('u1', sample);
    const found = await repo.findById('u1', created.id);

    if (found === null) {
      throw new Error('생성한 계획을 찾지 못함');
    }
    expect(normalize(found)).toEqual(normalize(created));
    expect(found.status).toBe('scheduled');
    expect(found.exercises).toHaveLength(2);
    expect(found.exercises[0].sets).toHaveLength(3);
    expect(found.exercises[0].sets[2].actual?.rir).toBe(2);
  });

  it('타 유저의 계획은 findById로 조회되지 않는다 (소유권 격리)', async () => {
    const repo = createD1PlanRepository(env.DB);
    const created = await repo.create('owner', sample);

    expect(await repo.findById('intruder', created.id)).toBeNull();
  });

  it('없는 id는 null', async () => {
    const repo = createD1PlanRepository(env.DB);
    expect(await repo.findById('u1', 'nope')).toBeNull();
  });

  it('routineDayId·overloadNote 없는 계획도 저장·복원된다 (nullable 분기)', async () => {
    const repo = createD1PlanRepository(env.DB);
    const input: NewPlan = {
      routineId: 'r1',
      routineDayLabel: '하체',
      date: '2026-05-26',
      exercises: [{ name: '스쿼트', muscleGroups: [], sets: [{ targetWeightKg: 60, targetReps: 5 }] }],
    };
    const created = await repo.create('u1', input);
    const found = await repo.findById('u1', created.id);

    expect(found?.routineDayId).toBeUndefined();
    expect(found?.overloadNote).toBeUndefined();
    expect(found?.exercises[0].sets[0].actual).toBeUndefined();
  });

  it('운동이 없는 계획도 저장·복원된다 (exercise/set insert 생략 분기)', async () => {
    const repo = createD1PlanRepository(env.DB);
    const input: NewPlan = {
      routineId: 'r1',
      routineDayLabel: '휴식',
      date: '2026-05-27',
      exercises: [],
    };
    const created = await repo.create('u1', input);
    const found = await repo.findById('u1', created.id);

    expect(found?.exercises).toEqual([]);
  });
});

// 2-Day 루틴을 만들고 그 id를 돌려준다(next-day/과부하 테스트의 토대).
const makeRoutine = async (userId: string): Promise<string> => {
  const routineRepo = createD1RoutineRepository(env.DB);
  const routine = await routineRepo.create(userId, {
    name: '상하체',
    goal: 'hypertrophy',
    splitType: 'upper_lower',
    daysPerWeek: 2,
    days: [
      {
        label: '상체',
        exercises: [{ name: '벤치', muscleGroups: ['chest'], targetSets: 3, targetRepRange: [8, 12] }],
      },
      {
        label: '하체',
        exercises: [{ name: '스쿼트', muscleGroups: ['legs'], targetSets: 3, targetRepRange: [5, 8] }],
      },
    ],
  });

  return routine.id;
};

// 주어진 Day를 완료 상태의 plan으로 만든다(repository.create는 scheduled 고정이라 직접 전이).
const completeDay = async (args: {
  userId: string;
  routineId: string;
  day: RoutineDayRef;
  date: string;
  exercises: NewPlan['exercises'];
}): Promise<void> => {
  const repo = createD1PlanRepository(env.DB);
  const created = await repo.create(args.userId, {
    routineId: args.routineId,
    routineDayId: args.day.routineDayId,
    routineDayLabel: args.day.label,
    date: args.date,
    exercises: args.exercises,
  });
  await drizzle(env.DB).update(plans).set({ status: 'completed' }).where(eq(plans.id, created.id));
};

const expectDay = (day: RoutineDayRef | null): RoutineDayRef => {
  if (day === null) {
    throw new Error('nextDay가 null을 반환함');
  }

  return day;
};

describe('createD1PlanRepository.nextDay', () => {
  it('완료 이력이 없으면 첫 Day(orderIndex 0)를 제시한다', async () => {
    const repo = createD1PlanRepository(env.DB);
    const routineId = await makeRoutine('nd1');

    const next = expectDay(await repo.nextDay('nd1', routineId));
    expect(next.label).toBe('상체');
    expect(next.orderIndex).toBe(0);
  });

  it('마지막 완료 Day의 다음 Day를 제시한다', async () => {
    const repo = createD1PlanRepository(env.DB);
    const routineId = await makeRoutine('nd2');
    const first = expectDay(await repo.nextDay('nd2', routineId));

    await completeDay({
      userId: 'nd2',
      routineId,
      day: first,
      date: '2026-05-25',
      exercises: [
        { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
      ],
    });

    const next = expectDay(await repo.nextDay('nd2', routineId));
    expect(next.label).toBe('하체');
    expect(next.orderIndex).toBe(1);
  });

  it('마지막 Day까지 끝내면 한 바퀴 돌아 첫 Day로 돌아온다', async () => {
    const repo = createD1PlanRepository(env.DB);
    const routineId = await makeRoutine('nd3');
    const first = expectDay(await repo.nextDay('nd3', routineId));
    await completeDay({
      userId: 'nd3',
      routineId,
      day: first,
      date: '2026-05-25',
      exercises: [
        { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
      ],
    });
    const second = expectDay(await repo.nextDay('nd3', routineId));
    await completeDay({
      userId: 'nd3',
      routineId,
      day: second,
      date: '2026-05-26',
      exercises: [
        { name: '스쿼트', muscleGroups: ['legs'], sets: [{ targetWeightKg: 60, targetReps: 5 }] },
      ],
    });

    const next = expectDay(await repo.nextDay('nd3', routineId));
    expect(next.label).toBe('상체');
  });

  it('Day가 없는(또는 타 유저) 루틴은 null', async () => {
    const repo = createD1PlanRepository(env.DB);
    const routineId = await makeRoutine('owner');

    expect(await repo.nextDay('owner', 'no-such-routine')).toBeNull();
    expect(await repo.nextDay('intruder', routineId)).toBeNull(); // 소유권 격리
  });
});

describe('createD1PlanRepository.lastOverload', () => {
  it('직전 완료 동일 Day의 실제 세트 기록을 운동별로 반환한다', async () => {
    const repo = createD1PlanRepository(env.DB);
    const routineId = await makeRoutine('ov1');
    const first = expectDay(await repo.nextDay('ov1', routineId));
    await completeDay({
      userId: 'ov1',
      routineId,
      day: first,
      date: '2026-05-25',
      exercises: [
        {
          name: '벤치',
          muscleGroups: ['chest'],
          sets: [
            {
              targetWeightKg: 50,
              targetReps: 8,
              actual: { weightKg: 50, reps: 8, rir: 2, completedAt: '2026-05-25T10:00:00.000Z' },
            },
          ],
        },
      ],
    });

    const overload = await repo.lastOverload('ov1', routineId, first.routineDayId);
    expect(overload).toHaveLength(1);
    expect(overload[0].exerciseName).toBe('벤치');
    expect(overload[0].sets).toHaveLength(1);
    expect(overload[0].sets[0].rir).toBe(2);
  });

  it('미수행(actual 없는) 세트는 과부하 근거에서 제외한다', async () => {
    const repo = createD1PlanRepository(env.DB);
    const routineId = await makeRoutine('ov2');
    const first = expectDay(await repo.nextDay('ov2', routineId));
    await completeDay({
      userId: 'ov2',
      routineId,
      day: first,
      date: '2026-05-25',
      exercises: [
        { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
      ],
    });

    const overload = await repo.lastOverload('ov2', routineId, first.routineDayId);
    expect(overload[0].sets).toEqual([]);
  });

  it('완료 이력이 없으면 빈 배열', async () => {
    const repo = createD1PlanRepository(env.DB);
    expect(await repo.lastOverload('ov3', 'r-none', 'd-none')).toEqual([]);
  });
});

describe('createD1PlanRepository.findDayId', () => {
  it('루틴 내 label로 routine_days.id를 찾는다', async () => {
    const repo = createD1PlanRepository(env.DB);
    const routineId = await makeRoutine('fd1');
    const first = expectDay(await repo.nextDay('fd1', routineId));

    expect(await repo.findDayId('fd1', routineId, '상체')).toBe(first.routineDayId);
  });

  it('없는 label·타 유저 루틴은 null (소유권 격리)', async () => {
    const repo = createD1PlanRepository(env.DB);
    const routineId = await makeRoutine('fd2');

    expect(await repo.findDayId('fd2', routineId, '없는Day')).toBeNull();
    expect(await repo.findDayId('intruder', routineId, '상체')).toBeNull();
  });
});

describe('createD1PlanRepository.updateStatus', () => {
  const plan: NewPlan = {
    routineId: 'r1',
    routineDayLabel: '상체',
    date: '2026-05-25',
    exercises: [
      { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
    ],
  };

  it('상태를 갱신하고 갱신된 레코드를 돌려준다(중첩 구조 보존)', async () => {
    const repo = createD1PlanRepository(env.DB);
    const created = await repo.create('us1', plan);

    const updated = await repo.updateStatus('us1', created.id, 'in_progress');
    expect(updated?.status).toBe('in_progress');
    expect(updated?.exercises).toHaveLength(1);
    // 영속됐는지 재조회로 확인
    expect((await repo.findById('us1', created.id))?.status).toBe('in_progress');
  });

  it('없거나 타 유저 계획은 null (소유권 격리)', async () => {
    const repo = createD1PlanRepository(env.DB);
    const created = await repo.create('us2', plan);

    expect(await repo.updateStatus('us2', 'no-such', 'in_progress')).toBeNull();
    expect(await repo.updateStatus('intruder', created.id, 'in_progress')).toBeNull();
  });
});
