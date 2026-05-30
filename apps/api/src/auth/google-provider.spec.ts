import { describe, expect, it } from 'vitest';
import { createGoogleProvider, type GoogleConfig } from './google-provider';

const config: GoogleConfig = {
  clientId: 'client-123',
  clientSecret: 'secret-xyz',
  redirectUri: 'https://app.test/auth/google/callback',
};

// base64url(JSON) — 테스트용 id_token payload 인코딩.
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken(claims: Record<string, unknown>): string {
  return `${b64url({ alg: 'RS256' })}.${b64url(claims)}.sig`;
}

describe('createGoogleProvider', () => {
  it('authorizeUrl에 client_id·redirect_uri·scope·PKCE 파라미터가 모두 실린다', () => {
    const provider = createGoogleProvider(config);
    const url = new URL(provider.authorizeUrl({ state: 'st', codeChallenge: 'ch' }));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('code_challenge')).toBe('ch');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchange는 토큰 응답의 id_token에서 email·sub를 신원으로 추출한다', async () => {
    const fakeFetch: typeof fetch = async () => {
      const idToken = makeIdToken({ email: 'u@example.com', sub: 'google-sub-1' });

      return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
    };

    const provider = createGoogleProvider(config, fakeFetch);
    const identity = await provider.exchange({ code: 'auth-code', codeVerifier: 'verifier-1' });

    expect(identity).toEqual({ email: 'u@example.com', providerUserId: 'google-sub-1' });
  });

  it('토큰 교환 실패(non-2xx)는 throw', async () => {
    const fakeFetch: typeof fetch = async () => new Response('nope', { status: 400 });
    const provider = createGoogleProvider(config, fakeFetch);

    await expect(provider.exchange({ code: 'bad', codeVerifier: 'v' })).rejects.toThrow();
  });
});
