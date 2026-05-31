import type { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { MeResponseDto } from '@workout/contracts';
import type { Env } from '../env';
import { Status, failBody, okBody } from '../response';
import type { AuthService } from './service';

export interface AuthDeps {
  authService: (env: Env) => AuthService;
  // 콜백 성공·로그아웃 후 돌아갈 앱 경로. web↔api 서브도메인 분리라 api 도메인이 아닌
  // web(APP_ORIGIN)으로 보내야 한다 — redirect 시 APP_ORIGIN을 prefix로 붙인 절대 URL을 쓴다.
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

    // state·verifier는 일회성 — 성공/실패와 무관하게 여기서 정리한다.
    deleteCookie(c, STATE_COOKIE, tempCookie);
    deleteCookie(c, VERIFIER_COOKIE, tempCookie);

    try {
      const issued = await deps.authService(c.env).complete({ code, codeVerifier: verifier });

      setCookie(c, SID_COOKIE, issued.sid, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        expires: new Date(issued.expiresAt),
      });

      return c.redirect(`${c.env.APP_ORIGIN}${deps.appRedirectPath}`);
    } catch {
      // 토큰 교환/신원 검증 실패는 외부 인증 실패로 보고 400으로 안내한다.
      return c.json(
        failBody('OAUTH_EXCHANGE_FAILED', '인증 처리에 실패했습니다.'),
        Status.BAD_REQUEST,
      );
    }
  });

  app.get('/auth/me', async (c) => {
    const sid = getCookie(c, SID_COOKIE);
    const user = sid === undefined ? null : await deps.authService(c.env).me(sid);
    if (user === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    return c.json(okBody(MeResponseDto, user), Status.OK);
  });

  app.post('/auth/logout', async (c) => {
    // CSRF 2선 — sid는 SameSite=Lax(교차사이트 POST 차단)지만, 상태 변경 POST는 Origin도 확인한다.
    if (isForeignOrigin(c.req.header('origin'), c.env.APP_ORIGIN)) {
      return c.json(failBody('FORBIDDEN_ORIGIN', '허용되지 않은 출처입니다.'), Status.FORBIDDEN);
    }

    const sid = getCookie(c, SID_COOKIE);
    if (sid !== undefined) {
      await deps.authService(c.env).logout(sid);
    }

    deleteCookie(c, SID_COOKIE, { path: '/' });

    return c.redirect(`${c.env.APP_ORIGIN}${deps.appRedirectPath}`);
  });
}

// Origin이 실려 왔는데 앱 오리진과 다르면 외부 출처(CSRF 의심). 없으면(same-origin 등) 통과시킨다.
function isForeignOrigin(origin: string | undefined, appOrigin: string): boolean {
  return origin !== undefined && origin !== appOrigin;
}
