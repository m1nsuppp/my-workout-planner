import { PlanChatResultDto, type CoachResultDto } from '@workout/contracts';
import { createApp } from '../app';
import type { SessionRepository } from '../auth/session-repository';
import type {
  NewPlan,
  PlannedSetRecord,
  PlanRecord,
  PlanSummaryRecord,
  RoutineDayRef,
} from './repository';
import type { PlanService } from './service';

// plan/coach 라우트 스위트가 공유하는 테스트 픽스처(컨트롤러 HTTP 행동만 검증하기 위한 fake 조립).

// SSE 응답 본문을 이벤트별로 분해한다(result/error는 마지막 값, delta는 누적).
export function parseSSE(text: string): { result?: unknown; error?: unknown; deltas: unknown[] } {
  const out: { result?: unknown; error?: unknown; deltas: unknown[] } = { deltas: [] };
  for (const block of text.split('\n\n')) {
    const lines = block.split('\n');
    const event = lines
      .find((l) => l.startsWith('event:'))
      ?.slice('event:'.length)
      .trim();
    const data = lines
      .find((l) => l.startsWith('data:'))
      ?.slice('data:'.length)
      .trim();
    if (event === undefined || data === undefined) {
      continue;
    }
    const parsed: unknown = JSON.parse(data);
    if (event === 'result') {
      out.result = parsed;
    } else if (event === 'error') {
      out.error = parsed;
    } else if (event === 'delta') {
      out.deltas.push(parsed);
    }
  }

  return out;
}

// 계획 생성 대화의 기본 응답(always-draft). 식별 필드는 brand 타입이라 계약 스키마로 parse해 만든다.
const defaultChatReply = PlanChatResultDto.parse({
  message: '오늘 컨디션 어때요?',
  planDraft: {
    routineId: 'r1',
    routineDayLabel: '상체 A',
    date: '2026-05-25',
    exercises: [
      {
        name: '벤치프레스',
        muscleGroups: ['chest'],
        sets: [{ targetWeightKg: 50, targetReps: 8 }],
      },
    ],
  },
});

export const sampleRecord: PlanRecord = {
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

export interface FakeOpts {
  createError?: Error;
  found?: PlanRecord | null;
  nextDay?: RoutineDayRef | null;
  seedDraft?: NewPlan;
  chatReply?: PlanChatResultDto;
  chatError?: Error;
  updated?: PlanRecord;
  updateStatusError?: Error;
  updatedSet?: PlannedSetRecord;
  coachApplied?: PlanRecord | null;
  coachError?: Error;
  coachReply?: CoachResultDto;
  summaries?: PlanSummaryRecord[];
}

const createFakePlanService = (opts: FakeOpts = {}): PlanService => ({
  create: async () => {
    if (opts.createError !== undefined) {
      throw opts.createError;
    }

    return sampleRecord;
  },
  get: async () => opts.found ?? null,
  list: async () => opts.summaries ?? [],
  nextDay: async () => opts.nextDay ?? null,
  overloadFor: async () => [],
  templateFor: async () => [],
  seedDraft: async (_userId, routineId, routineDayLabel, date) =>
    opts.seedDraft ?? {
      routineId,
      routineDayLabel,
      date,
      exercises: [
        {
          name: '벤치프레스',
          muscleGroups: ['chest'],
          sets: [{ targetWeightKg: 50, targetReps: 8 }],
        },
      ],
    },
  updateStatus: async () => {
    if (opts.updateStatusError !== undefined) {
      throw opts.updateStatusError;
    }

    return opts.updated ?? null;
  },
  updateSet: async () => opts.updatedSet ?? null,
  applyCoachChange: async () => {
    if (opts.coachError !== undefined) {
      throw opts.coachError;
    }

    return opts.coachApplied ?? null;
  },
});

// 이 스위트는 plan/coach 라우트만 검증한다. 다른 도메인 deps는 호출되지 않는 더미.
const dummyAuth = {
  begin: async () => ({ state: '', verifier: '', authorizeUrl: '' }),
  complete: async () => ({ sid: '', expiresAt: '' }),
  logout: async () => undefined,
  me: async () => null,
};

export const VALID_SID = 'valid-sid';
const fakeSessionRepository: SessionRepository = {
  create: async (s) => ({ id: VALID_SID, ...s, createdAt: '' }),
  delete: async () => undefined,
  findValid: async (id) =>
    id === VALID_SID
      ? { id, userId: 'u1', expiresAt: '2026-12-31T00:00:00.000Z', createdAt: '' }
      : null,
};

export const appWith = (opts: FakeOpts = {}) =>
  createApp({
    planService: () => createFakePlanService(opts),
    planChatService: () => ({
      reply: async () => {
        if (opts.chatError !== undefined) {
          throw opts.chatError;
        }

        return opts.chatReply ?? defaultChatReply;
      },
    }),
    coachService: () => ({
      reply: async () => opts.coachReply ?? { message: '좀 더 버텨봐요!', change: null },
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
export const devEnv = { ENVIRONMENT: 'development', APP_ORIGIN: 'http://localhost:5173' };
export const authed = { Cookie: `sid=${VALID_SID}` };
