import { deriveChallenge, generateState, generateVerifier } from './pkce';
import type { OAuthProvider } from './oauth-provider';
import type { UserRepository } from './user-repository';
import type { SessionRepository } from './session-repository';

// 로그인 시작 시 콜백까지 보존해야 하는 값(state·verifier)과 보낼 URL.
export interface LoginStart {
  state: string;
  verifier: string;
  authorizeUrl: string;
}

// 로그인 완료 시 발급된 세션.
export interface IssuedSession {
  sid: string;
  expiresAt: string;
}

// 현재 로그인 사용자(표시·식별용).
export interface AuthenticatedUser {
  id: string;
  email: string;
}

// 인증 흐름 오케스트레이션. 사용하는 쪽(라우트) 관점.
export interface AuthService {
  begin: () => Promise<LoginStart>;
  complete: (params: { code: string; codeVerifier: string }) => Promise<IssuedSession>;
  logout: (sid: string) => Promise<void>;
  // sid → 유효 세션 → 사용자. 세션이 없거나 만료면 null(미인증).
  me: (sid: string) => Promise<AuthenticatedUser | null>;
}

export interface AuthServiceDeps {
  provider: OAuthProvider;
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  // 세션 만료 계산 기준 시각(주입 → 테스트가 시계를 제어).
  now: () => Date;
  sessionTtlMs: number;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { provider, userRepository, sessionRepository, now, sessionTtlMs } = deps;

  return {
    begin: async () => {
      const state = generateState();
      const verifier = generateVerifier();
      const codeChallenge = await deriveChallenge(verifier);

      return { state, verifier, authorizeUrl: provider.authorizeUrl({ state, codeChallenge }) };
    },
    complete: async ({ code, codeVerifier }) => {
      const identity = await provider.exchange({ code, codeVerifier });
      const user = await userRepository.upsertByProvider({
        provider: provider.name,
        providerUserId: identity.providerUserId,
        email: identity.email,
      });

      const expiresAt = new Date(now().getTime() + sessionTtlMs).toISOString();
      const session = await sessionRepository.create({ userId: user.id, expiresAt });

      return { sid: session.id, expiresAt };
    },
    logout: async (sid) => {
      await sessionRepository.delete(sid);
    },
    me: async (sid) => {
      const session = await sessionRepository.findValid(sid, now().toISOString());
      if (session === null) {
        return null;
      }

      const user = await userRepository.findById(session.userId);

      return user === null ? null : { id: user.id, email: user.email };
    },
  };
}
