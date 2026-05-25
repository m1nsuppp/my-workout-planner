import {
  CreateRoutineResponseDto,
  GetRoutineResponseDto,
  ListRoutinesResponseDto,
} from '@workout/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { RoutineRecord } from './repository';
import { RoutineValidationError, type RoutineService } from './service';

const sampleRecord: RoutineRecord = {
  id: 'r1',
  createdAt: new Date().toISOString(),
  name: '주 4회 상하체 분할',
  goal: 'hypertrophy',
  splitType: 'upper_lower',
  daysPerWeek: 4,
  days: [
    {
      label: '상체 A',
      exercises: [{ name: '벤치프레스', muscleGroups: ['chest'], targetSets: 3, targetRepRange: [8, 12] }],
    },
  ],
};

// fake 서비스 — 컨트롤러(HTTP 행동)만 검증하기 위해 도메인 협력자를 가린다.
interface FakeOpts {
  createError?: Error;
  records?: RoutineRecord[];
  found?: RoutineRecord | null;
}
class FakeRoutineService implements RoutineService {
  constructor(private readonly opts: FakeOpts = {}) {}

  async create(): Promise<RoutineRecord> {
    if (this.opts.createError !== undefined) {
      throw this.opts.createError;
    }

    return sampleRecord;
  }

  async list(): Promise<RoutineRecord[]> {
    return this.opts.records ?? [];
  }

  async get(): Promise<RoutineRecord | null> {
    return this.opts.found ?? null;
  }
}

const appWith = (opts: FakeOpts = {}) => createApp({ routineService: () => new FakeRoutineService(opts) });

const validBody = {
  name: '주 4회 상하체 분할',
  goal: 'hypertrophy',
  splitType: 'upper_lower',
  daysPerWeek: 4,
  days: [
    {
      label: '상체 A',
      exercises: [{ name: '벤치프레스', muscleGroups: ['chest'], targetSets: 3, targetRepRange: [8, 12] }],
    },
  ],
};

const postRoutine = async (opts: FakeOpts, body: unknown, userId = 'u1') =>
  await appWith(opts).request('/routines', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(userId !== '' ? { 'x-user-id': userId } : {}) },
    body: JSON.stringify(body),
  });

describe('POST /routines', () => {
  it('유효 요청 → 201 + ok 봉투', async () => {
    const res = await postRoutine({}, validBody);
    expect(res.status).toBe(201);
    const json = CreateRoutineResponseDto.parse(await res.json());
    expect(json.ok).toBe(true);
    if (json.ok) {
      expect(json.data.id).toBeTruthy();
    }
  });

  it('스키마 위반 → 422 VALIDATION_FAILED', async () => {
    const res = await postRoutine({}, { ...validBody, goal: 'not_a_goal' });
    expect(res.status).toBe(422);
    const json = CreateRoutineResponseDto.parse(await res.json());
    expect(json.ok).toBe(false);
    if (!json.ok) {
      expect(json.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('도메인 규칙 위반(service throw) → 422 ROUTINE_INVALID + issues', async () => {
    const res = await postRoutine({ createError: new RoutineValidationError(['Day가 없습니다.']) }, validBody);
    expect(res.status).toBe(422);
    const json = CreateRoutineResponseDto.parse(await res.json());
    if (!json.ok) {
      expect(json.error.code).toBe('ROUTINE_INVALID');
      expect(json.error.details).toEqual(['Day가 없습니다.']);
    }
  });

  it('인증 헤더 없음 → 401', async () => {
    const res = await postRoutine({}, validBody, '');
    expect(res.status).toBe(401);
  });
});

describe('GET /routines', () => {
  it('목록 → 200 + 배열', async () => {
    const res = await appWith({ records: [sampleRecord] }).request('/routines', {
      headers: { 'x-user-id': 'u1' },
    });
    expect(res.status).toBe(200);
    const json = ListRoutinesResponseDto.parse(await res.json());
    if (json.ok) {
      expect(json.data).toHaveLength(1);
    }
  });

  it('인증 없음 → 401', async () => {
    const res = await appWith().request('/routines');
    expect(res.status).toBe(401);
  });
});

describe('GET /routines/:id', () => {
  it('존재 → 200', async () => {
    const res = await appWith({ found: sampleRecord }).request('/routines/r1', {
      headers: { 'x-user-id': 'u1' },
    });
    expect(res.status).toBe(200);
  });

  it('없음 → 404 NOT_FOUND', async () => {
    const res = await appWith({ found: null }).request('/routines/nope', {
      headers: { 'x-user-id': 'u1' },
    });
    expect(res.status).toBe(404);
    const json = GetRoutineResponseDto.parse(await res.json());
    expect(json.ok).toBe(false);
    if (!json.ok) {
      expect(json.error.code).toBe('NOT_FOUND');
    }
  });
});
