import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { RoutineService } from '../routines/service';
import type { AuthService } from './service';

// 라우트의 HTTP 변환(쿠키·리다이렉트·state 검증)만 본다. 비즈니스는 service.spec이 검증.
const fakeAuth: AuthService = {
  begin: async () => ({
    state: 'st',
    verifier: 'vf',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=st',
  }),
  complete: async () => ({ sid: 'session-1', expiresAt: '2026-12-31T00:00:00.000Z' }),
  logout: async () => undefined,
  me: async (sid) => (sid === 'session-1' ? { id: 'user-1', email: 'a@example.com' } : null),
};

// routine 라우트는 이 테스트에서 호출되지 않는 더미.
const dummyRoutine: RoutineService = {
  create: async () => {
    throw new Error('unused');
  },
  list: async () => [],
  get: async () => null,
};

// authService만 바꿔 끼우는 헬퍼. routine 인증 더미는 이 스위트에서 쓰이지 않는다.
const makeApp = (authService: AuthService) =>
  createApp({
    routineService: () => dummyRoutine,
    routineChatService: () => ({
      reply: async () => {
        throw new Error('unused');
      },
    }),
    planService: () => ({
      create: async () => {
        throw new Error('unused');
      },
      get: async () => null,
      nextDay: async () => null,
      overloadFor: async () => [],
    }),
    sessionRepository: () => ({
      create: async (s) => ({ id: '', ...s, createdAt: '' }),
      findValid: async () => null,
      delete: async () => undefined,
    }),
    now: () => new Date('2026-05-30T00:00:00.000Z'),
    authService: () => authService,
    appRedirectPath: '/home',
  });

const app = makeApp(fakeAuth);

const env = { ENVIRONMENT: 'development', APP_ORIGIN: 'http://localhost:5173' };

const setCookies = (res: Response): string[] => res.headers.getSetCookie();
const cookieNames = (res: Response) => setCookies(res).map((c) => c.split('=')[0]);

describe('GET /auth/google/start', () => {
  it('302로 authorizeUrl로 보내고 state·verifier 쿠키를 심는다', async () => {
    const res = await app.request('/auth/google/start', undefined, env);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?state=st',
    );
    expect(cookieNames(res)).toEqual(expect.arrayContaining(['oauth_state', 'oauth_verifier']));
  });
});

describe('GET /auth/google/callback', () => {
  it('state 일치 → 세션 쿠키 발급 후 앱으로 리다이렉트', async () => {
    const res = await app.request(
      '/auth/google/callback?code=abc&state=st',
      { headers: { Cookie: 'oauth_state=st; oauth_verifier=vf' } },
      env,
    );

    expect(res.status).toBe(302);
    // 분리 구조 — 콜백 후 web(APP_ORIGIN) 절대 URL로 돌아간다(api 도메인 아님).
    expect(res.headers.get('location')).toBe('http://localhost:5173/home');
    const sidCookie = setCookies(res).find((c) => c.startsWith('sid='));
    expect(sidCookie).toContain('sid=session-1');
    expect(sidCookie).toContain('HttpOnly');
  });

  it('state 불일치 → 400 (CSRF 차단)', async () => {
    const res = await app.request(
      '/auth/google/callback?code=abc&state=WRONG',
      { headers: { Cookie: 'oauth_state=st; oauth_verifier=vf' } },
      env,
    );

    expect(res.status).toBe(400);
  });

  it('state 쿠키 없음 → 400', async () => {
    const res = await app.request('/auth/google/callback?code=abc&state=st', undefined, env);

    expect(res.status).toBe(400);
  });

  it('complete 실패 → 400 + 임시 쿠키(state·verifier) 정리', async () => {
    const failingAuth: AuthService = {
      ...fakeAuth,
      complete: async () => {
        throw new Error('exchange failed');
      },
    };
    const res = await makeApp(failingAuth).request(
      '/auth/google/callback?code=abc&state=st',
      { headers: { Cookie: 'oauth_state=st; oauth_verifier=vf' } },
      env,
    );

    expect(res.status).toBe(400);
    const temp = setCookies(res).filter(
      (c) => c.startsWith('oauth_state=') || c.startsWith('oauth_verifier='),
    );
    expect(temp).toHaveLength(2);
    expect(temp.every((c) => c.includes('Max-Age=0'))).toBe(true);
  });
});

describe('GET /auth/me', () => {
  it('유효 sid면 200으로 현재 사용자를 봉투에 담아 준다', async () => {
    const res = await app.request('/auth/me', { headers: { Cookie: 'sid=session-1' } }, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { id: 'user-1', email: 'a@example.com' } });
  });

  it('sid 쿠키 없음 → 401 UNAUTHENTICATED', async () => {
    const res = await app.request('/auth/me', undefined, env);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('세션이 무효한 sid → 401', async () => {
    const res = await app.request('/auth/me', { headers: { Cookie: 'sid=expired' } }, env);

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('sid 쿠키를 만료시키고 리다이렉트한다', async () => {
    const res = await app.request(
      '/auth/logout',
      { method: 'POST', headers: { Cookie: 'sid=session-1' } },
      env,
    );

    expect(res.status).toBe(302);
    const sidCookie = setCookies(res).find((c) => c.startsWith('sid='));
    expect(sidCookie).toContain('Max-Age=0');
  });

  it('앱 오리진과 일치하는 Origin이면 정상 로그아웃한다', async () => {
    const res = await app.request(
      '/auth/logout',
      { method: 'POST', headers: { Cookie: 'sid=session-1', Origin: 'http://localhost:5173' } },
      env,
    );

    expect(res.status).toBe(302);
  });

  it('외부 Origin이면 403으로 차단한다(CSRF 2선)', async () => {
    const res = await app.request(
      '/auth/logout',
      { method: 'POST', headers: { Cookie: 'sid=session-1', Origin: 'https://evil.example' } },
      env,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_ORIGIN' } });
  });
});
