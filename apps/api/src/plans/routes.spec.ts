import {
  ApiFailureSchema,
  CreatePlanResponseDto,
  GetPlanResponseDto,
  NextDayResponseDto,
  PlanChatResultDto,
  UpdateSetResponseDto,
} from '@workout/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { SessionRepository } from '../auth/session-repository';
import { LlmError } from '../llm/client';
import type { PlannedSetRecord, PlanRecord, RoutineDayRef } from './repository';
import { InvalidPlanTransitionError, PlanValidationError, type PlanService } from './service';

const sampleRecord: PlanRecord = {
  id: 'p1',
  status: 'scheduled',
  createdAt: new Date().toISOString(),
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    {
      name: '벤치프레스',
      muscleGroups: ['chest'],
      sets: [{ id: 's1', targetWeightKg: 50, targetReps: 8 }],
    },
  ],
};

// fake 서비스 — 컨트롤러(HTTP 행동)만 검증하기 위해 도메인 협력자를 가린다.
interface FakeOpts {
  createError?: Error;
  found?: PlanRecord | null;
  nextDay?: RoutineDayRef | null;
  chatReply?: PlanChatResultDto;
  chatError?: Error;
  updated?: PlanRecord;
  updateStatusError?: Error;
  updatedSet?: PlannedSetRecord;
}
const createFakePlanService = (opts: FakeOpts = {}): PlanService => ({
  create: async () => {
    if (opts.createError !== undefined) {
      throw opts.createError;
    }

    return sampleRecord;
  },
  get: async () => opts.found ?? null,
  nextDay: async () => opts.nextDay ?? null,
  overloadFor: async () => [],
  updateStatus: async () => {
    if (opts.updateStatusError !== undefined) {
      throw opts.updateStatusError;
    }

    return opts.updated ?? null;
  },
  updateSet: async () => opts.updatedSet ?? null,
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
    planChatService: () => ({
      reply: async () => {
        if (opts.chatError !== undefined) {
          throw opts.chatError;
        }

        return opts.chatReply ?? { phase: 'asking', message: '오늘 컨디션 어때요?' };
      },
    }),
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

describe('GET /api/routines/:id/next-day', () => {
  it('다음 차례 Day → 200 + {routineDayId, label}', async () => {
    const next: RoutineDayRef = { routineDayId: 'd2', label: '하체', orderIndex: 1 };
    const res = await appWith({ nextDay: next }).request(
      '/api/routines/r1/next-day',
      { headers: authed },
      devEnv,
    );
    expect(res.status).toBe(200);
    const json = NextDayResponseDto.parse(await res.json());
    if (json.ok) {
      expect(json.data).toEqual({ routineDayId: 'd2', label: '하체' });
    }
  });

  it('Day 없는(또는 없는) 루틴 → 404 NOT_FOUND', async () => {
    const res = await appWith({ nextDay: null }).request(
      '/api/routines/nope/next-day',
      { headers: authed },
      devEnv,
    );
    expect(res.status).toBe(404);
  });

  it('인증 없음 → 401', async () => {
    const res = await appWith().request('/api/routines/r1/next-day', undefined, devEnv);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/plans/chat', () => {
  const postChat = async (opts: FakeOpts, body: unknown, authenticated = true) =>
    await appWith(opts).request(
      '/api/plans/chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(authenticated ? authed : {}) },
        body: JSON.stringify(body),
      },
      devEnv,
    );

  const chatBody = {
    routineId: 'r1',
    routineDayLabel: '상체 A',
    date: '2026-05-25',
    history: [{ role: 'user', content: '오늘 계획 짜줘' }],
  };

  it('asking 응답 → 200 + 봉투 없는 raw proposal', async () => {
    const res = await postChat({ chatReply: { phase: 'asking', message: '컨디션 어때요?' } }, chatBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ phase: 'asking', message: '컨디션 어때요?' });
  });

  it('proposing 응답 → 200 + planDraft 포함', async () => {
    // routineId·date는 brand 타입이라 리터럴 대입이 안 됨 — 계약 스키마로 parse해 생성한다.
    const proposal = PlanChatResultDto.parse({
      phase: 'proposing',
      message: '이 계획 어때요?',
      planDraft: {
        routineId: 'r1',
        routineDayLabel: '상체 A',
        date: '2026-05-25',
        exercises: [
          { name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
        ],
      },
    });
    const res = await postChat({ chatReply: proposal }, chatBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(proposal);
  });

  it('LLM 실패 → 502 LLM_FAILED', async () => {
    const res = await postChat({ chatError: new LlmError('boom') }, chatBody);
    expect(res.status).toBe(502);
    const json = ApiFailureSchema.parse(await res.json());
    expect(json.error.code).toBe('LLM_FAILED');
  });

  it('필드 누락 → 422 VALIDATION_FAILED', async () => {
    const res = await postChat({}, { history: [] });
    expect(res.status).toBe(422);
  });

  it('인증 없음 → 401', async () => {
    const res = await postChat({}, chatBody, false);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/plans/:id/status', () => {
  const patchStatus = async (opts: FakeOpts, body: unknown, authenticated = true) =>
    await appWith(opts).request(
      '/api/plans/p1/status',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(authenticated ? authed : {}) },
        body: JSON.stringify(body),
      },
      devEnv,
    );

  it('유효 전이 → 200 + 갱신된 계획', async () => {
    const updated: PlanRecord = { ...sampleRecord, status: 'in_progress' };
    const res = await patchStatus({ updated }, { status: 'in_progress' });
    expect(res.status).toBe(200);
    const json = GetPlanResponseDto.parse(await res.json());
    if (json.ok) {
      expect(json.data.status).toBe('in_progress');
    }
  });

  it('허용 안 된 전이 → 409 INVALID_STATE_TRANSITION', async () => {
    const res = await patchStatus(
      { updateStatusError: new InvalidPlanTransitionError('completed', 'in_progress') },
      { status: 'in_progress' },
    );
    expect(res.status).toBe(409);
    const json = ApiFailureSchema.parse(await res.json());
    expect(json.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('없는 계획 → 404 NOT_FOUND', async () => {
    const res = await patchStatus({}, { status: 'in_progress' });
    expect(res.status).toBe(404);
  });

  it('잘못된 status 값 → 422 VALIDATION_FAILED', async () => {
    const res = await patchStatus({}, { status: 'scheduled' }); // 요청으로 못 보내는 값
    expect(res.status).toBe(422);
  });

  it('인증 없음 → 401', async () => {
    const res = await patchStatus({}, { status: 'in_progress' }, false);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/sets/:id', () => {
  const patchSet = async (opts: FakeOpts, body: unknown, authenticated = true) =>
    await appWith(opts).request(
      '/api/sets/s1',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(authenticated ? authed : {}) },
        body: JSON.stringify(body),
      },
      devEnv,
    );

  it('유효 기록 → 200 + actual 담긴 세트', async () => {
    const updatedSet: PlannedSetRecord = {
      id: 's1',
      targetWeightKg: 50,
      targetReps: 8,
      actual: { weightKg: 50, reps: 8, rir: 2, completedAt: '2026-05-30T00:00:00.000Z' },
    };
    const res = await patchSet({ updatedSet }, { weightKg: 50, reps: 8, rir: 2 });
    expect(res.status).toBe(200);
    const json = UpdateSetResponseDto.parse(await res.json());
    if (json.ok) {
      expect(json.data.actual?.rir).toBe(2);
    }
  });

  it('없는 세트 → 404 NOT_FOUND', async () => {
    const res = await patchSet({}, { weightKg: 50, reps: 8, rir: 2 });
    expect(res.status).toBe(404);
  });

  it('잘못된 값(음수 reps) → 422 VALIDATION_FAILED', async () => {
    const res = await patchSet({}, { weightKg: 50, reps: -1, rir: 2 });
    expect(res.status).toBe(422);
  });

  it('인증 없음 → 401', async () => {
    const res = await patchSet({}, { weightKg: 50, reps: 8, rir: 2 }, false);
    expect(res.status).toBe(401);
  });
});
