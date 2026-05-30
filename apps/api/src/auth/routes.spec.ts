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
};

// routine 라우트는 이 테스트에서 호출되지 않는 더미.
const dummyRoutine: RoutineService = {
  create: async () => {
    throw new Error('unused');
  },
  list: async () => [],
  get: async () => null,
};

const app = createApp({
  routineService: () => dummyRoutine,
  // routine 인증은 이 스위트에서 쓰이지 않는 더미.
  sessionRepository: () => ({
    create: async (s) => ({ id: '', ...s, createdAt: '' }),
    findValid: async () => null,
    delete: async () => undefined,
  }),
  now: () => new Date('2026-05-30T00:00:00.000Z'),
  authService: () => fakeAuth,
  appRedirectPath: '/home',
});

const env = { ENVIRONMENT: 'development' };

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
    expect(res.headers.get('location')).toBe('/home');
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
});
