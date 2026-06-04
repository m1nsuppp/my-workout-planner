import {
  CreateRoutineResponseDto,
  GetRoutineResponseDto,
  ListRoutinesResponseDto,
  ApiFailureSchema,
  type RoutineChatResultDto,
} from '@workout/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { SessionRepository } from '../auth/session-repository';
import { LlmError } from '../llm/client';
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
      exercises: [
        { name: '벤치프레스', muscleGroups: ['chest'], targetSets: 3, targetRepRange: [8, 12] },
      ],
    },
  ],
};

// fake 서비스 — 컨트롤러(HTTP 행동)만 검증하기 위해 도메인 협력자를 가린다.
interface FakeOpts {
  createError?: Error;
  records?: RoutineRecord[];
  found?: RoutineRecord | null;
  chatReply?: RoutineChatResultDto;
  chatError?: Error;
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

// 이 스위트는 routine 라우트만 검증한다. auth deps는 호출되지 않는 더미.
const dummyAuth = {
  begin: async () => ({ state: '', verifier: '', authorizeUrl: '' }),
  complete: async () => ({ sid: '', expiresAt: '' }),
  logout: async () => undefined,
  me: async () => null,
};

// 인증은 세션 쿠키(sid) 기반. VALID_SID만 userId 'u1'로 인증된다.
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
    routineService: () => new FakeRoutineService(opts),
    planService: () => ({
      create: async () => {
        throw new Error('unused');
      },
      get: async () => null,
      nextDay: async () => null,
      overloadFor: async () => [],
    }),
    planChatService: () => ({
      reply: async () => {
        throw new Error('unused');
      },
    }),
    routineChatService: () => ({
      reply: async () => {
        if (opts.chatError !== undefined) {
          throw opts.chatError;
        }

        return opts.chatReply ?? { phase: 'asking', message: '목표가 뭐예요?' };
      },
    }),
    sessionRepository: () => fakeSessionRepository,
    now: () => new Date('2026-05-30T00:00:00.000Z'),
    authService: () => dummyAuth,
    appRedirectPath: '/',
  });

// APP_ORIGIN은 CORS 미들웨어(web↔api 분리)가 요구한다 — routine 라우트도 이 미들웨어를 탄다.
const devEnv = { ENVIRONMENT: 'development', APP_ORIGIN: 'http://localhost:5173' };
const authed = { Cookie: `sid=${VALID_SID}` };

const validBody = {
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
};

const postRoutine = async (opts: FakeOpts, body: unknown, authenticated = true) =>
  await appWith(opts).request(
    '/api/routines',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authenticated ? authed : {}) },
      body: JSON.stringify(body),
    },
    devEnv,
  );

describe('POST /api/routines', () => {
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
    const res = await postRoutine(
      { createError: new RoutineValidationError(['Day가 없습니다.']) },
      validBody,
    );
    expect(res.status).toBe(422);
    const json = CreateRoutineResponseDto.parse(await res.json());
    if (!json.ok) {
      expect(json.error.code).toBe('ROUTINE_INVALID');
      expect(json.error.details).toEqual(['Day가 없습니다.']);
    }
  });

  it('세션 쿠키 없음 → 401', async () => {
    const res = await postRoutine({}, validBody, false);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/routines/chat', () => {
  const postChat = async (opts: FakeOpts, body: unknown, authenticated = true) =>
    await appWith(opts).request(
      '/api/routines/chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(authenticated ? authed : {}) },
        body: JSON.stringify(body),
      },
      devEnv,
    );

  const history = { history: [{ role: 'user', content: '주 4회 근비대 루틴 짜줘' }] };

  it('asking 응답 → 200 + 봉투 없는 raw proposal', async () => {
    const res = await postChat({ chatReply: { phase: 'asking', message: '운동 경력은요?' } }, history);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ phase: 'asking', message: '운동 경력은요?' });
  });

  it('proposing 응답 → 200 + routine 포함', async () => {
    const proposal: RoutineChatResultDto = {
      phase: 'proposing',
      message: '이 루틴 어때요?',
      routine: {
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
      },
    };
    const res = await postChat({ chatReply: proposal }, history);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(proposal);
  });

  it('LLM 실패 → 502 LLM_FAILED', async () => {
    const res = await postChat({ chatError: new LlmError('boom') }, history);
    expect(res.status).toBe(502);
    const json = ApiFailureSchema.parse(await res.json());
    expect(json.error.code).toBe('LLM_FAILED');
  });

  it('history 누락 → 422 VALIDATION_FAILED', async () => {
    const res = await postChat({}, {});
    expect(res.status).toBe(422);
  });

  it('인증 없음 → 401', async () => {
    const res = await postChat({}, history, false);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/routines', () => {
  it('목록 → 200 + 배열', async () => {
    const res = await appWith({ records: [sampleRecord] }).request(
      '/api/routines',
      { headers: authed },
      devEnv,
    );
    expect(res.status).toBe(200);
    const json = ListRoutinesResponseDto.parse(await res.json());
    if (json.ok) {
      expect(json.data).toHaveLength(1);
    }
  });

  it('인증 없음 → 401', async () => {
    const res = await appWith().request('/api/routines', undefined, devEnv);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/routines/:id', () => {
  it('존재 → 200', async () => {
    const res = await appWith({ found: sampleRecord }).request(
      '/api/routines/r1',
      { headers: authed },
      devEnv,
    );
    expect(res.status).toBe(200);
  });

  it('없음 → 404 NOT_FOUND', async () => {
    const res = await appWith({ found: null }).request(
      '/api/routines/nope',
      { headers: authed },
      devEnv,
    );
    expect(res.status).toBe(404);
    const json = GetRoutineResponseDto.parse(await res.json());
    expect(json.ok).toBe(false);
    if (!json.ok) {
      expect(json.error.code).toBe('NOT_FOUND');
    }
  });
});
