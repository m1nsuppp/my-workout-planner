import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createD1PlanRepository } from './d1-repository';
import type { NewPlan, PlanRecord } from './repository';

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
