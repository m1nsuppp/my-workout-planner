import { describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from './app';
import type { AuthService } from './auth/service';
import type { SessionRepository } from './auth/session-repository';
import type { RoutineService } from './routines/service';

// CORS만 검증하는 스위트 — 라우트 동작은 호출되지 않으므로 협력자는 전부 더미.
const dummyRoutine: RoutineService = {
  create: async () => {
    throw new Error('unused');
  },
  list: async () => [],
  get: async () => null,
};
const dummyAuth: AuthService = {
  begin: async () => ({ state: '', verifier: '', authorizeUrl: '' }),
  complete: async () => ({ sid: '', expiresAt: '' }),
  logout: async () => undefined,
  me: async () => null,
};
const dummySession: SessionRepository = {
  create: async (s) => ({ id: '', ...s, createdAt: '' }),
  delete: async () => undefined,
  findValid: async () => null,
};

const deps: AppDeps = {
  routineService: () => dummyRoutine,
  planService: () => ({
    create: async () => {
      throw new Error('unused');
    },
    get: async () => null,
    list: async () => [],
    nextDay: async () => null,
    overloadFor: async () => [],
    updateStatus: async () => null,
    updateSet: async () => null,
    applyCoachChange: async () => null,
  }),
  coachService: () => ({
    reply: async () => {
      throw new Error('unused');
    },
  }),
  planChatService: () => ({
    reply: async () => {
      throw new Error('unused');
    },
  }),
  routineChatService: () => ({
    reply: async () => {
      throw new Error('unused');
    },
  }),
  sessionRepository: () => dummySession,
  authService: () => dummyAuth,
  now: () => new Date('2026-05-30T00:00:00.000Z'),
  appRedirectPath: '/',
};

// web↔api 서브도메인 분리(cross-origin)에서 fetch가 sid 쿠키를 싣게 하는 CORS 계약.
const APP_ORIGIN = 'http://localhost:5173';
const env = { ENVIRONMENT: 'development', APP_ORIGIN };

describe('CORS', () => {
  it('허용 오리진(APP_ORIGIN) 요청엔 자격증명 CORS 헤더를 echo한다', async () => {
    const res = await createApp(deps).request(
      '/api/hello',
      { headers: { Origin: APP_ORIGIN } },
      env,
    );

    expect(res.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('비허용 오리진엔 Allow-Origin 헤더를 주지 않는다(브라우저가 차단)', async () => {
    const res = await createApp(deps).request(
      '/api/hello',
      { headers: { Origin: 'https://evil.example' } },
      env,
    );

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('OPTIONS preflight는 204로 응답하고 허용 오리진을 echo한다', async () => {
    const res = await createApp(deps).request(
      '/api/routines',
      {
        method: 'OPTIONS',
        headers: { Origin: APP_ORIGIN, 'Access-Control-Request-Method': 'GET' },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
  });
});
