import { describe, expect, it } from 'vitest';
import { createFakeOAuthProvider } from './oauth-provider';

describe('createFakeOAuthProvider', () => {
  it('authorizeUrl에 state와 code_challenge가 실린다', () => {
    const provider = createFakeOAuthProvider('google', {});
    const url = provider.authorizeUrl({ state: 's1', codeChallenge: 'c1' });

    expect(url).toContain('state=s1');
    expect(url).toContain('code_challenge=c1');
  });

  it('exchange는 매핑된 code를 신원으로 바꾼다', async () => {
    const provider = createFakeOAuthProvider('google', {
      'code-1': { email: 'a@example.com', providerUserId: 'g-1' },
    });

    expect(await provider.exchange({ code: 'code-1', codeVerifier: 'v' })).toEqual({
      email: 'a@example.com',
      providerUserId: 'g-1',
    });
  });

  it('알 수 없는 code는 throw (실패를 숨기지 않음)', async () => {
    const provider = createFakeOAuthProvider('google', {});
    await expect(provider.exchange({ code: 'nope', codeVerifier: 'v' })).rejects.toThrow();
  });
});
