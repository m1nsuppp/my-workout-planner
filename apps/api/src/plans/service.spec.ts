import { describe, expect, it } from 'vitest';
import type { NewPlan, PlanRecord, PlanRepository } from './repository';
import { PlanValidationError, createPlanService } from './service';

// fake 저장소 — 실제 D1 없이 service의 공개 인터페이스(입력 → 출력/throw)만 검증.
// next-day/과부하/findDayId는 기본 더미, overrides로 케이스별 동작을 주입한다.
const createFakePlanRepository = (overrides: Partial<PlanRepository> = {}): PlanRepository => {
  const store = new Map<string, PlanRecord[]>();
  let seq = 0;

  return {
    create: async (userId, plan) => {
      const record: PlanRecord = {
        id: `p${++seq}`,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        ...plan,
      };
      const list = store.get(userId) ?? [];
      list.push(record);
      store.set(userId, list);

      return record;
    },
    findById: async (userId, id) => (store.get(userId) ?? []).find((p) => p.id === id) ?? null,
    nextDay: async () => null,
    lastOverload: async () => [],
    findDayId: async () => null,
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

describe('createPlanService.get', () => {
  it('없는 id는 null', async () => {
    const { service } = setup();
    expect(await service.get('u1', 'nope')).toBeNull();
  });
});
