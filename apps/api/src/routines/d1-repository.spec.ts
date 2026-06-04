import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createD1RoutineRepository } from './d1-repository';
import type { NewRoutine, RoutineRecord } from './repository';

const sample: NewRoutine = {
  name: '주 4회 상하체 분할',
  goal: 'hypertrophy',
  splitType: 'upper_lower',
  daysPerWeek: 4,
  days: [
    {
      label: '상체 A',
      exercises: [
        {
          name: '벤치프레스',
          muscleGroups: ['chest', 'triceps'],
          targetSets: 3,
          targetRepRange: [8, 12],
        },
        { name: '랫풀다운', muscleGroups: ['back'], targetSets: 4, targetRepRange: [10, 15] },
      ],
    },
    {
      label: '하체',
      exercises: [
        { name: '스쿼트', muscleGroups: ['legs', 'glutes'], targetSets: 5, targetRepRange: [5, 8] },
      ],
    },
  ],
};

// muscleGroups는 순서 없는 집합 — 비교 시 정렬해 정규화한다(day·운동 순서는 보존 대상이라 그대로).
const normalize = (r: RoutineRecord): RoutineRecord => ({
  ...r,
  days: r.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e, muscleGroups: [...e.muscleGroups].sort() })),
  })),
});

describe('createD1RoutineRepository (실제 D1)', () => {
  it('create → findById 왕복이 무손실이다 (4테이블 분해→복원)', async () => {
    const repo = createD1RoutineRepository(env.DB);
    const created = await repo.create('u1', sample);
    const found = await repo.findById('u1', created.id);

    // 중첩 구조(day 순서, 운동 순서, 근육군 집합)가 그대로 복원되는가
    if (found === null) {
      throw new Error('생성한 루틴을 찾지 못함');
    }
    expect(normalize(found)).toEqual(normalize(created));
    expect(found.days).toHaveLength(2);
    expect(found.days[0].exercises).toHaveLength(2);
  });

  it('list는 해당 유저의 루틴만 반환한다 (소유권 격리)', async () => {
    const repo = createD1RoutineRepository(env.DB);
    await repo.create('owner', sample);
    await repo.create('other', sample);

    const owned = await repo.list('owner');
    expect(owned).toHaveLength(1);
  });

  it('타 유저의 루틴은 findById로 조회되지 않는다', async () => {
    const repo = createD1RoutineRepository(env.DB);
    const created = await repo.create('owner', sample);

    expect(await repo.findById('intruder', created.id)).toBeNull();
  });

  it('없는 id는 null', async () => {
    const repo = createD1RoutineRepository(env.DB);
    expect(await repo.findById('u1', 'nope')).toBeNull();
  });

  // 리포지토리는 도메인 검증을 하지 않는다(그건 service 책임). 빈 입력도 그대로 저장·복원.
  it('근육군이 빈 운동도 저장·복원된다 (muscle insert 생략 분기)', async () => {
    const repo = createD1RoutineRepository(env.DB);
    const input: NewRoutine = {
      name: '맨몸',
      goal: 'endurance',
      splitType: 'custom',
      daysPerWeek: 3,
      days: [
        {
          label: '코어',
          exercises: [
            { name: '플랭크', muscleGroups: [], targetSets: 3, targetRepRange: [30, 60] },
          ],
        },
      ],
    };
    const created = await repo.create('u1', input);
    const found = await repo.findById('u1', created.id);

    expect(found?.days[0].exercises[0].muscleGroups).toEqual([]);
  });

  it('Day가 없는 루틴도 저장·복원된다 (day/exercise insert 생략 분기)', async () => {
    const repo = createD1RoutineRepository(env.DB);
    const input: NewRoutine = {
      name: '빈 루틴',
      goal: 'strength',
      splitType: 'custom',
      daysPerWeek: 1,
      days: [],
    };
    const created = await repo.create('u1', input);
    const found = await repo.findById('u1', created.id);

    expect(found?.days).toEqual([]);
  });

  // 운동·근육군이 많으면 한 INSERT의 바인딩 변수가 D1 한도(100)를 넘는다 → 청크 분할이 필요.
  it('운동이 많은 루틴도 저장된다 (D1 변수 한도 청크 분할)', async () => {
    const repo = createD1RoutineRepository(env.DB);
    const exercises = Array.from({ length: 8 }, (_, i) => ({
      name: `운동 ${i}`,
      muscleGroups: ['chest', 'triceps'] as string[],
      targetSets: 3,
      targetRepRange: [8, 12] as [number, number],
    }));
    const big: NewRoutine = {
      name: '대형 전신',
      goal: 'hypertrophy',
      splitType: 'full_body',
      daysPerWeek: 3,
      // 24운동(8×3) × 7컬럼 = 168 변수 — 한 INSERT면 한도 초과, 청크로 나뉘어야 통과.
      days: [
        { label: '전신 A', exercises },
        { label: '전신 B', exercises },
        { label: '전신 C', exercises },
      ],
    };

    const created = await repo.create('u1', big);
    const found = await repo.findById('u1', created.id);

    expect(found?.days).toHaveLength(3);
    expect(found?.days[0].exercises).toHaveLength(8);
    expect(found?.days[2].exercises[7].name).toBe('운동 7');
  });
});
