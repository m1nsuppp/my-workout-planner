import { describe, expect, it } from 'vitest';
import { deriveChallenge, generateState, generateVerifier } from './pkce';

describe('pkce', () => {
  // RFC 7636 Appendix B 테스트 벡터 — S256 변환 정확성.
  it('deriveChallenge는 RFC 7636 테스트 벡터와 일치한다', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(await deriveChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('generateVerifier는 URL-safe이고 43자 이상이다 (RFC 길이 요건)', () => {
    const v = generateVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43);
  });

  it('state·verifier는 호출마다 달라진다', () => {
    expect(generateState()).not.toBe(generateState());
    expect(generateVerifier()).not.toBe(generateVerifier());
  });
});
