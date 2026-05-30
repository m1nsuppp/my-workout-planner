// PKCE(RFC 7636) + CSRF state 생성. Workers 런타임의 Web Crypto만 사용.

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }

  // base64 → base64url: +/= 를 URL-safe로.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

const STATE_BYTES = 16;
const VERIFIER_BYTES = 32; // 32바이트 → 43자 base64url (RFC 7636 최소 길이 충족)

// CSRF 방어용 state. 콜백에서 쿠키 값과 대조한다.
export function generateState(): string {
  return randomToken(STATE_BYTES);
}

// PKCE code_verifier. 43~128자 범위를 만족.
export function generateVerifier(): string {
  return randomToken(VERIFIER_BYTES);
}

// code_challenge = BASE64URL(SHA-256(verifier)). method=S256.
export async function deriveChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));

  return base64UrlEncode(new Uint8Array(digest));
}
