import type { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import type { Env } from '../env';
import { Status, failBody } from '../response';
import type { AuthService } from './service';

export interface AuthDeps {
  authService: (env: Env) => AuthService;
  // 콜백 성공 후 돌아갈 앱 경로(웹앱 연동 시 조정).
  appRedirectPath: string;
}

const SID_COOKIE = 'sid';
const STATE_COOKIE = 'oauth_state';
const VERIFIER_COOKIE = 'oauth_verifier';

const TEMP_COOKIE_MAX_AGE = 600; // 10분 — OAuth 왕복 동안만 유효

// 콜백까지 보존하는 단명 쿠키(state·verifier)의 공통 속성.
const tempCookie: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax', // OAuth top-level 리다이렉트에서 쿠키가 실려야 하므로 Strict 불가
  path: '/',
  maxAge: TEMP_COOKIE_MAX_AGE,
};

export function registerAuthRoutes(app: Hono<{ Bindings: Env }>, deps: AuthDeps): void {
  app.get('/auth/google/start', async (c) => {
    const { state, verifier, authorizeUrl } = await deps.authService(c.env).begin();

    setCookie(c, STATE_COOKIE, state, tempCookie);
    setCookie(c, VERIFIER_COOKIE, verifier, tempCookie);

    return c.redirect(authorizeUrl);
  });

  app.get('/auth/google/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const expectedState = getCookie(c, STATE_COOKIE);
    const verifier = getCookie(c, VERIFIER_COOKIE);

    // state 불일치/누락은 CSRF로 간주해 차단. verifier 없으면 PKCE 진행 불가.
    if (
      code === undefined ||
      state === undefined ||
      expectedState === undefined ||
      verifier === undefined ||
      state !== expectedState
    ) {
      return c.json(failBody('INVALID_OAUTH_STATE', '잘못된 인증 요청입니다.'), Status.BAD_REQUEST);
    }

    const { sid, expiresAt } = await deps
      .authService(c.env)
      .complete({ code, codeVerifier: verifier });

    deleteCookie(c, STATE_COOKIE, tempCookie);
    deleteCookie(c, VERIFIER_COOKIE, tempCookie);
    setCookie(c, SID_COOKIE, sid, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      expires: new Date(expiresAt),
    });

    return c.redirect(deps.appRedirectPath);
  });

  app.post('/auth/logout', async (c) => {
    const sid = getCookie(c, SID_COOKIE);
    if (sid !== undefined) {
      await deps.authService(c.env).logout(sid);
    }

    deleteCookie(c, SID_COOKIE, { path: '/' });

    return c.redirect(deps.appRedirectPath);
  });
}
