import { describe, expect, it } from 'vitest';
import type { NewPlan, PlanRecord, PlanRepository } from './repository';
import {
  CoachApplyError,
  CoachIdempotencyError,
  InvalidPlanTransitionError,
  PlanValidationError,
  createPlanService,
} from './service';

// fake 저장소 — 실제 D1 없이 service의 공개 인터페이스(입력 → 출력/throw)만 검증.
// next-day/과부하/findDayId는 기본 더미, overrides로 케이스별 동작을 주입한다.
const createFakePlanRepository = (overrides: Partial<PlanRepository> = {}): PlanRepository => {
  const store = new Map<string, PlanRecord[]>();
  const appliedKeys = new Set<string>();
  let seq = 0;

  return {
    create: async (userId, plan) => {
      const id = `p${++seq}`;
      const record: PlanRecord = {
        id,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        routineId: plan.routineId,
        routineDayId: plan.routineDayId,
        routineDayLabel: plan.routineDayLabel,
        date: plan.date,
        overloadNote: plan.overloadNote,
        exercises: plan.exercises.map((ex, i) => ({
          ...ex,
          sets: ex.sets.map((s, j) => ({ ...s, id: `${id}-e${i}-s${j}` })),
        })),
      };
      const list = store.get(userId) ?? [];
      list.push(record);
      store.set(userId, list);

      return record;
    },
    findById: async (userId, id) => (store.get(userId) ?? []).find((p) => p.id === id) ?? null,
    listSummaries: async (userId) =>
      (store.get(userId) ?? []).map((p) => ({
        id: p.id,
        date: p.date,
        status: p.status,
        routineDayLabel: p.routineDayLabel,
        exerciseCount: p.exercises.length,
      })),
    nextDay: async () => null,
    lastOverload: async () => [],
    findDayId: async () => null,
    updateStatus: async (userId, id, status) => {
      const target = (store.get(userId) ?? []).find((p) => p.id === id);
      if (target === undefined) {
        return null;
      }
      target.status = status;

      return target;
    },
    updateSet: async () => null,
    applyCoachChange: async (userId, planId, apply) => {
      const target = (store.get(userId) ?? []).find((p) => p.id === planId);
      if (target === undefined) {
        return null;
      }
      if (appliedKeys.has(apply.idempotencyKey)) {
        return 'conflict';
      }
      appliedKeys.add(apply.idempotencyKey);
      target.exercises = apply.exercises;

      return target;
    },
    ...overrides,
  };
};

const setup = () => {
  const repo = createFakePlanRepository();

  return { repo, service: createPlanService(repo) };
};

const validPlan = (): NewPlan => ({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    { name: '벤치프레스', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
  ],
});

// create가 던진 PlanValidationError의 issues를 꺼낸다. 안 던지면 실패.
const issuesOf = async (service: ReturnType<typeof setup>['service'], input: NewPlan) => {
  try {
    await service.create('u1', input);
  } catch (e) {
    if (e instanceof PlanValidationError) {
      return e.issues;
    }
    throw e;
  }
  throw new Error('PlanValidationError가 발생할 것으로 기대했지만 통과함');
};

describe('createPlanService.create — 유효한 계획', () => {
  it('저장하고 id·status가 부여된 레코드를 반환한다', async () => {
    const { service } = setup();
    const record = await service.create('u1', validPlan());
    expect(record.id).toBeTruthy();
    expect(record.status).toBe('scheduled');
  });

  it('저장된 계획은 id로 조회된다', async () => {
    const { service } = setup();
    const created = await service.create('u1', validPlan());
    expect((await service.get('u1', created.id))?.id).toBe(created.id);
  });
});

describe('createPlanService.create — 도메인 규칙 위반', () => {
  it('운동이 0개면 거부한다', async () => {
    const { service } = setup();
    expect(await issuesOf(service, { ...validPlan(), exercises: [] })).not.toHaveLength(0);
  });

  it('운동에 세트가 없으면 거부한다', async () => {
    const { service } = setup();
    const input = validPlan();
    input.exercises[0].sets = [];
    expect(await issuesOf(service, input)).not.toHaveLength(0);
  });

  it('규칙 위반 시 아무것도 저장하지 않는다', async () => {
    const { service } = setup();
    await issuesOf(service, { ...validPlan(), exercises: [] });
    const created = await service.create('u1', validPlan());
    // 위반 건은 저장 안 됐고, 직후 유효 건만 조회됨
    expect((await service.get('u1', created.id))?.id).toBe(created.id);
  });
});

describe('createPlanService.create — routineDayId 채움', () => {
  it('확정 시 label로 routineDayId를 채워 저장한다', async () => {
    const repo = createFakePlanRepository({ findDayId: async () => 'day-1' });
    const created = await createPlanService(repo).create('u1', validPlan());
    expect(created.routineDayId).toBe('day-1');
  });

  it('label이 루틴에 없으면 routineDayId 없이 저장한다(관대)', async () => {
    const repo = createFakePlanRepository({ findDayId: async () => null });
    const created = await createPlanService(repo).create('u1', validPlan());
    expect(created.routineDayId).toBeNull();
  });
});

describe('createPlanService.overloadFor', () => {
  it('label이 실재하면 그 Day의 과부하 기록을 준다', async () => {
    const repo = createFakePlanRepository({
      findDayId: async () => 'day-1',
      lastOverload: async () => [{ exerciseName: '벤치', sets: [] }],
    });
    expect(await createPlanService(repo).overloadFor('u1', 'r1', '상체')).toHaveLength(1);
  });

  it('label이 없으면 빈 배열(과부하 근거 없음)', async () => {
    const repo = createFakePlanRepository({ findDayId: async () => null });
    expect(await createPlanService(repo).overloadFor('u1', 'r1', '없는Day')).toEqual([]);
  });
});

describe('createPlanService.updateStatus', () => {
  it('scheduled→in_progress→completed 전이를 허용한다', async () => {
    const { service } = setup();
    const p = await service.create('u1', validPlan());

    expect((await service.updateStatus('u1', p.id, 'in_progress'))?.status).toBe('in_progress');
    expect((await service.updateStatus('u1', p.id, 'completed'))?.status).toBe('completed');
  });

  it('역전이(completed→in_progress)는 거부한다', async () => {
    const { service } = setup();
    const p = await service.create('u1', validPlan());
    await service.updateStatus('u1', p.id, 'in_progress');
    await service.updateStatus('u1', p.id, 'completed');

    await expect(service.updateStatus('u1', p.id, 'in_progress')).rejects.toThrow();
  });

  it('중간 단계를 건너뛰는 전이(scheduled→completed)는 거부한다', async () => {
    const { service } = setup();
    const p = await service.create('u1', validPlan());

    await expect(service.updateStatus('u1', p.id, 'completed')).rejects.toThrow();
  });

  it('없는 계획은 null', async () => {
    const { service } = setup();
    expect(await service.updateStatus('u1', 'nope', 'in_progress')).toBeNull();
  });
});

describe('createPlanService.get', () => {
  it('없는 id는 null', async () => {
    const { service } = setup();
    expect(await service.get('u1', 'nope')).toBeNull();
  });
});

// 완료 세트(actual)와 미완료 세트가 섞인 in_progress 계획 — 코치 적용 가드 검증용.
const benchWithDone = (): NewPlan => ({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    {
      name: '벤치프레스',
      muscleGroups: ['chest'],
      sets: [
        { targetWeightKg: 50, targetReps: 8, actual: { weightKg: 50, reps: 8, rir: 2, completedAt: 't' } },
        { targetWeightKg: 50, targetReps: 8 },
        { targetWeightKg: 50, targetReps: 8 },
      ],
    },
  ],
});

// create 후 in_progress로 전이한 계획을 돌려준다(코치는 운동 중에만 개입).
const startWorkout = async (
  service: ReturnType<typeof setup>['service'],
  input: NewPlan,
): Promise<PlanRecord> => {
  const created = await service.create('u1', input);
  await service.updateStatus('u1', created.id, 'in_progress');

  return created;
};

const apply = { idempotencyKey: 'k1', appliedAt: '2026-05-25T11:00:00.000Z' };

describe('createPlanService.applyCoachChange — adjust_load', () => {
  it('미완료 세트만 무게를 하향하고 2.5kg로 반올림한다(완료 세트 보존)', async () => {
    const { service } = setup();
    const created = await startWorkout(service, benchWithDone());

    const result = await service.applyCoachChange(
      'u1',
      created.id,
      { kind: 'adjust_load', targetExerciseName: '벤치프레스', weightFactor: 0.85, reason: '컨디션 난조' },
      apply,
    );

    const sets = result?.exercises[0].sets ?? [];
    expect(sets[0].targetWeightKg).toBe(50); // 완료 세트 불변
    expect(sets[0].actual?.rir).toBe(2);
    expect(sets[1].targetWeightKg).toBe(42.5); // 50*0.85=42.5
    expect(sets[2].targetWeightKg).toBe(42.5);
  });

  it('dropSets로 남은 세트를 줄인다', async () => {
    const { service } = setup();
    const created = await startWorkout(service, benchWithDone());

    const result = await service.applyCoachChange(
      'u1',
      created.id,
      { kind: 'adjust_load', targetExerciseName: '벤치프레스', weightFactor: 1, dropSets: 1, reason: 'x' },
      apply,
    );

    // 완료 1 + 미완료 2 → dropSets 1 → 완료 1 + 미완료 1 = 2
    expect(result?.exercises[0].sets).toHaveLength(2);
  });

  it('dropSets가 남은 세트보다 많으면 거부한다', async () => {
    const { service } = setup();
    const created = await startWorkout(service, benchWithDone());

    await expect(
      service.applyCoachChange(
        'u1',
        created.id,
        { kind: 'adjust_load', targetExerciseName: '벤치프레스', weightFactor: 1, dropSets: 5, reason: 'x' },
        apply,
      ),
    ).rejects.toBeInstanceOf(CoachApplyError);
  });
});

describe('createPlanService.applyCoachChange — substitute', () => {
  const dumbbell = {
    kind: 'substitute' as const,
    targetExerciseName: '벤치프레스',
    replacement: {
      name: '덤벨프레스',
      muscleGroups: ['chest'],
      sets: [{ targetWeightKg: 20, targetReps: 10 }],
    },
    reason: '벤치 자리 없음',
  };

  it('운동을 교체하고 사유를 메모로 남긴다', async () => {
    const { service } = setup();
    // 완료 세트 없는 계획(교체 가능)
    const created = await startWorkout(service, validPlan());

    const result = await service.applyCoachChange('u1', created.id, dumbbell, apply);

    expect(result?.exercises[0].name).toBe('덤벨프레스');
    expect(result?.exercises[0].note).toBe('벤치 자리 없음');
  });

  it('이미 수행한 세트가 있으면 교체를 거부한다', async () => {
    const { service } = setup();
    const created = await startWorkout(service, benchWithDone());

    await expect(service.applyCoachChange('u1', created.id, dumbbell, apply)).rejects.toBeInstanceOf(
      CoachApplyError,
    );
  });

  it('교체 운동의 근육군이 원본과 안 맞으면 거부한다', async () => {
    const { service } = setup();
    const created = await startWorkout(service, validPlan());
    const wrong = { ...dumbbell, replacement: { ...dumbbell.replacement, muscleGroups: ['legs'] } };

    await expect(service.applyCoachChange('u1', created.id, wrong, apply)).rejects.toBeInstanceOf(
      CoachApplyError,
    );
  });
});

describe('createPlanService.applyCoachChange — 공통 가드', () => {
  const adjust = {
    kind: 'adjust_load' as const,
    targetExerciseName: '벤치프레스',
    weightFactor: 0.8,
    reason: 'x',
  };

  it('대상 운동이 계획에 없으면 거부한다', async () => {
    const { service } = setup();
    const created = await startWorkout(service, validPlan());

    await expect(
      service.applyCoachChange('u1', created.id, { ...adjust, targetExerciseName: '없는운동' }, apply),
    ).rejects.toBeInstanceOf(CoachApplyError);
  });

  it('in_progress가 아니면 거부한다(scheduled)', async () => {
    const { service } = setup();
    const created = await service.create('u1', validPlan()); // scheduled 그대로

    await expect(
      service.applyCoachChange('u1', created.id, adjust, apply),
    ).rejects.toBeInstanceOf(InvalidPlanTransitionError);
  });

  it('같은 멱등성 키로 다시 적용하면 거부한다', async () => {
    const { service } = setup();
    const created = await startWorkout(service, validPlan());
    await service.applyCoachChange('u1', created.id, adjust, apply);

    await expect(service.applyCoachChange('u1', created.id, adjust, apply)).rejects.toBeInstanceOf(
      CoachIdempotencyError,
    );
  });

  it('없는 계획은 null', async () => {
    const { service } = setup();
    expect(await service.applyCoachChange('u1', 'nope', adjust, apply)).toBeNull();
  });
});
