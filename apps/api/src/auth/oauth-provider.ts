// OAuth provider 포트. 라우트/서비스는 이 인터페이스만 알고, Google 등 구현 세부는 모른다.
// 소비 관점: "로그인 보낼 URL을 만들고, 돌아온 code를 신원으로 바꾼다".

export interface AuthorizeParams {
  state: string;
  codeChallenge: string;
}

export interface ExchangeParams {
  code: string;
  codeVerifier: string;
}

// provider가 식별해준 신원. email은 표시용, providerUserId가 안정적 키.
export interface OAuthIdentity {
  email: string;
  providerUserId: string;
}

export interface OAuthProvider {
  // provider 식별자(users.provider에 저장). 'google' 등.
  readonly name: string;
  authorizeUrl: (params: AuthorizeParams) => string;
  exchange: (params: ExchangeParams) => Promise<OAuthIdentity>;
}

// 테스트용 fake. code → 신원 매핑 사전으로 실제 네트워크 없이 동작을 흉내낸다.
export function createFakeOAuthProvider(
  name: string,
  codeToIdentity: Record<string, OAuthIdentity>,
): OAuthProvider {
  const identities = new Map(Object.entries(codeToIdentity));

  return {
    name,
    authorizeUrl: ({ state, codeChallenge }) =>
      `https://fake-oauth.test/authorize?state=${state}&code_challenge=${codeChallenge}`,
    exchange: async ({ code }) => {
      await Promise.resolve(); // 실제 provider의 네트워크 I/O 경계를 흉내
      const identity = identities.get(code);
      if (identity === undefined) {
        // 알 수 없는 code는 숨기지 않고 던진다.
        throw new Error(`fake provider: 알 수 없는 code "${code}"`);
      }

      return identity;
    },
  };
}
