import { z } from 'zod';
import type { OAuthIdentity, OAuthProvider } from './oauth-provider';

// Google OAuth(OpenID Connect) 구현. 이 파일만 Google 엔드포인트/응답 형식을 안다.

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'openid email';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// 토큰 응답 중 우리가 쓰는 것만. 나머지는 무시.
const TokenResponseSchema = z.object({ id_token: z.string() });
// id_token(JWT) payload 중 신원에 필요한 클레임. aud는 발급 대상(우리 client_id) 검증용.
const IdTokenClaimsSchema = z.object({ email: z.string(), sub: z.string(), aud: z.string() });

// fetch를 주입 가능하게 해서 테스트가 네트워크 없이 응답을 고정한다.
export function createGoogleProvider(
  config: GoogleConfig,
  fetchFn: typeof fetch = fetch,
): OAuthProvider {
  return {
    name: 'google',
    authorizeUrl: ({ state, codeChallenge }) => {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: SCOPE,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
    },
    exchange: async ({ code, codeVerifier }) => {
      const res = await fetchFn(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });

      if (!res.ok) {
        // 교환 실패는 숨기지 않고 던진다.
        throw new Error(`Google 토큰 교환 실패: ${res.status}`);
      }

      const { id_token: idToken } = TokenResponseSchema.parse(await res.json());

      return claimsToIdentity(idToken, config.clientId);
    },
  };
}

const JWT_PARTS = 3; // header.payload.signature
const BASE64_BLOCK = 4;

// id_token은 토큰 엔드포인트에서 TLS로 직접 받았으므로 서명 검증은 생략한다.
// 단, aud(발급 대상)가 우리 client_id인지 확인해 다른 클라이언트용 토큰을 거부한다.
function claimsToIdentity(idToken: string, expectedAud: string): OAuthIdentity {
  const parts = idToken.split('.');
  if (parts.length !== JWT_PARTS) {
    throw new Error('id_token 형식이 올바르지 않습니다.');
  }

  const json = new TextDecoder().decode(base64UrlDecode(parts[1]));
  const claims = IdTokenClaimsSchema.parse(JSON.parse(json));

  if (claims.aud !== expectedAud) {
    throw new Error('id_token의 aud가 client_id와 일치하지 않습니다.');
  }

  return { email: claims.email, providerUserId: claims.sub };
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / BASE64_BLOCK) * BASE64_BLOCK, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
