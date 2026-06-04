import { CreatePlanResponseDto, GetPlanResponseDto } from '@workout/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { SessionRepository } from '../auth/session-repository';
import type { PlanRecord } from './repository';
import { PlanValidationError, type PlanService } from './service';

const sampleRecord: PlanRecord = {
  id: 'p1',
  status: 'scheduled',
  createdAt: new Date().toISOString(),
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    { name: '벤치프레스', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
  ],
};

// fake 서비스 — 컨트롤러(HTTP 행동)만 검증하기 위해 도메인 협력자를 가린다.
interface FakeOpts {
  createError?: Error;
  found?: PlanRecord | null;
}
const createFakePlanService = (opts: FakeOpts = {}): PlanService => ({
  create: async () => {
    if (opts.createError !== undefined) {
      throw opts.createError;
    }

    return sampleRecord;
  },
  get: async () => opts.found ?? null,
  nextDay: async () => null,
  overloadFor: async () => [],
});

// 이 스위트는 plan 라우트만 검증한다. 다른 도메인 deps는 호출되지 않는 더미.
const dummyAuth = {
  begin: async () => ({ state: '', verifier: '', authorizeUrl: '' }),
  complete: async () => ({ sid: '', expiresAt: '' }),
  logout: async () => undefined,
  me: async () => null,
};

const VALID_SID = 'valid-sid';
const fakeSessionRepository: SessionRepository = {
  create: async (s) => ({ id: VALID_SID, ...s, createdAt: '' }),
  delete: async () => undefined,
  findValid: async (id) =>
    id === VALID_SID
      ? { id, userId: 'u1', expiresAt: '2026-12-31T00:00:00.000Z', createdAt: '' }
      : null,
};

const appWith = (opts: FakeOpts = {}) =>
  createApp({
    planService: () => createFakePlanService(opts),
    routineService: () => ({
      create: async () => {
        throw new Error('unused');
      },
      list: async () => [],
      get: async () => null,
    }),
    routineChatService: () => ({
      reply: async () => {
        throw new Error('unused');
      },
    }),
    sessionRepository: () => fakeSessionRepository,
    now: () => new Date('2026-05-30T00:00:00.000Z'),
    authService: () => dummyAuth,
    appRedirectPath: '/',
  });

// APP_ORIGIN은 CORS 미들웨어(web↔api 분리)가 요구한다 — plan 라우트도 이 미들웨어를 탄다.
const devEnv = { ENVIRONMENT: 'development', APP_ORIGIN: 'http://localhost:5173' };
const authed = { Cookie: `sid=${VALID_SID}` };

const validBody = {
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    { name: '벤치프레스', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
  ],
};

const postPlan = async (opts: FakeOpts, body: unknown, authenticated = true) =>
  await appWith(opts).request(
    '/api/plans',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authenticated ? authed : {}) },
      body: JSON.stringify(body),
    },
    devEnv,
  );

describe('POST /api/plans', () => {
  it('유효 요청 → 201 + ok 봉투', async () => {
    const res = await postPlan({}, validBody);
    expect(res.status).toBe(201);
    const json = CreatePlanResponseDto.parse(await res.json());
    expect(json.ok).toBe(true);
    if (json.ok) {
      expect(json.data.id).toBeTruthy();
    }
  });

  it('스키마 위반 → 422 VALIDATION_FAILED', async () => {
    const res = await postPlan({}, { ...validBody, date: 'not-a-date' });
    expect(res.status).toBe(422);
    const json = CreatePlanResponseDto.parse(await res.json());
    if (!json.ok) {
      expect(json.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('도메인 규칙 위반(service throw) → 422 PLAN_INVALID + issues', async () => {
    const res = await postPlan(
      { createError: new PlanValidationError(['운동이 없습니다.']) },
      validBody,
    );
    expect(res.status).toBe(422);
    const json = CreatePlanResponseDto.parse(await res.json());
    if (!json.ok) {
      expect(json.error.code).toBe('PLAN_INVALID');
      expect(json.error.details).toEqual(['운동이 없습니다.']);
    }
  });

  it('세션 쿠키 없음 → 401', async () => {
    const res = await postPlan({}, validBody, false);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/plans/:id', () => {
  it('존재 → 200', async () => {
    const res = await appWith({ found: sampleRecord }).request(
      '/api/plans/p1',
      { headers: authed },
      devEnv,
    );
    expect(res.status).toBe(200);
    const json = GetPlanResponseDto.parse(await res.json());
    expect(json.ok).toBe(true);
  });

  it('없음 → 404 NOT_FOUND', async () => {
    const res = await appWith({ found: null }).request(
      '/api/plans/nope',
      { headers: authed },
      devEnv,
    );
    expect(res.status).toBe(404);
    const json = GetPlanResponseDto.parse(await res.json());
    if (!json.ok) {
      expect(json.error.code).toBe('NOT_FOUND');
    }
  });

  it('인증 없음 → 401', async () => {
    const res = await appWith().request('/api/plans/p1', undefined, devEnv);
    expect(res.status).toBe(401);
  });
});
