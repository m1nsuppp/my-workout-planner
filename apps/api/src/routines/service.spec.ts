import { describe, expect, it } from 'vitest';
import type { NewRoutine, RoutineRecord, RoutineRepository } from './repository';
import { RoutineValidationError, createRoutineService } from './service';

// fake 저장소 — 실제 D1 없이 service의 공개 인터페이스(입력 → 출력/throw)만 검증.
class FakeRoutineRepository implements RoutineRepository {
  private readonly store = new Map<string, RoutineRecord[]>();
  private seq = 0;

  async create(userId: string, routine: NewRoutine): Promise<RoutineRecord> {
    const record: RoutineRecord = {
      id: `r${++this.seq}`,
      createdAt: new Date().toISOString(),
      ...routine,
    };
    const list = this.store.get(userId) ?? [];
    list.push(record);
    this.store.set(userId, list);

    return record;
  }

  async list(userId: string): Promise<RoutineRecord[]> {
    return this.store.get(userId) ?? [];
  }

  async findById(userId: string, id: string): Promise<RoutineRecord | null> {
    return (this.store.get(userId) ?? []).find((r) => r.id === id) ?? null;
  }
}

const setup = () => {
  const repo = new FakeRoutineRepository();

  return { repo, service: createRoutineService(repo) };
};

const validRoutine = (): NewRoutine => ({
  name: '주 4회 상하체 분할',
  goal: 'hypertrophy',
  splitType: 'upper_lower',
  daysPerWeek: 4,
  days: [
    {
      label: '상체 A',
      exercises: [
        { name: '벤치프레스', muscleGroups: ['chest'], targetSets: 3, targetRepRange: [8, 12] },
      ],
    },
  ],
});

// create가 던진 RoutineValidationError의 issues를 꺼낸다. 안 던지면 실패.
const issuesOf = async (service: ReturnType<typeof setup>['service'], input: NewRoutine) => {
  try {
    await service.create('u1', input);
  } catch (e) {
    if (e instanceof RoutineValidationError) {
      return e.issues;
    }
    throw e;
  }
  throw new Error('RoutineValidationError가 발생할 것으로 기대했지만 통과함');
};

describe('createRoutineService.create — 유효한 루틴', () => {
  it('저장하고 id가 부여된 레코드를 반환한다', async () => {
    const { service } = setup();
    const record = await service.create('u1', validRoutine());
    expect(record.id).toBeTruthy();
    expect(record.name).toBe('주 4회 상하체 분할');
  });

  it('저장된 루틴은 list로 조회된다', async () => {
    const { service } = setup();
    await service.create('u1', validRoutine());
    expect(await service.list('u1')).toHaveLength(1);
  });
});

describe('createRoutineService.create — 도메인 규칙 위반', () => {
  it('Day가 0개면 거부한다', async () => {
    const { service } = setup();
    expect(await issuesOf(service, { ...validRoutine(), days: [] })).not.toHaveLength(0);
  });

  it('Day에 운동이 없으면 거부한다', async () => {
    const { service } = setup();
    const input = validRoutine();
    input.days[0].exercises = [];
    expect(await issuesOf(service, input)).not.toHaveLength(0);
  });

  it('rep 범위가 min > max면 거부한다', async () => {
    const { service } = setup();
    const input = validRoutine();
    input.days[0].exercises[0].targetRepRange = [12, 8];
    expect(await issuesOf(service, input)).not.toHaveLength(0);
  });

  it('Day label이 중복되면 거부한다', async () => {
    const { service } = setup();
    const input = validRoutine();
    input.days.push({ ...input.days[0] });
    expect(await issuesOf(service, input)).not.toHaveLength(0);
  });

  it('운동에 근육군이 없으면 거부한다', async () => {
    const { service } = setup();
    const input = validRoutine();
    input.days[0].exercises[0].muscleGroups = [];
    expect(await issuesOf(service, input)).not.toHaveLength(0);
  });

  it('규칙 위반 시 아무것도 저장하지 않는다', async () => {
    const { service } = setup();
    await issuesOf(service, { ...validRoutine(), days: [] });
    expect(await service.list('u1')).toHaveLength(0);
  });
});

describe('createRoutineService.get', () => {
  it('생성한 루틴을 id로 조회한다', async () => {
    const { service } = setup();
    const created = await service.create('u1', validRoutine());
    const found = await service.get('u1', created.id);
    expect(found?.id).toBe(created.id);
  });

  it('없는 id는 null', async () => {
    const { service } = setup();
    expect(await service.get('u1', 'nope')).toBeNull();
  });
});
