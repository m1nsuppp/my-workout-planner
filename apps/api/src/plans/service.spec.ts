import { describe, expect, it } from 'vitest';
import type { NewPlan, PlanRecord, PlanRepository } from './repository';
import { PlanValidationError, createPlanService } from './service';

// fake 저장소 — 실제 D1 없이 service의 공개 인터페이스(입력 → 출력/throw)만 검증.
class FakePlanRepository implements PlanRepository {
  private readonly store = new Map<string, PlanRecord[]>();
  private seq = 0;

  async create(userId: string, plan: NewPlan): Promise<PlanRecord> {
    const record: PlanRecord = {
      id: `p${++this.seq}`,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      ...plan,
    };
    const list = this.store.get(userId) ?? [];
    list.push(record);
    this.store.set(userId, list);

    return record;
  }

  async findById(userId: string, id: string): Promise<PlanRecord | null> {
    return (this.store.get(userId) ?? []).find((p) => p.id === id) ?? null;
  }
}

const setup = () => {
  const repo = new FakePlanRepository();

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

describe('createPlanService.get', () => {
  it('없는 id는 null', async () => {
    const { service } = setup();
    expect(await service.get('u1', 'nope')).toBeNull();
  });
});
