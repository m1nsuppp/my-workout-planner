import { describe, expect, it } from 'vitest';
import { ApiResponseError } from '../shared/api-response-error';
import { createFakeHttpClient } from '../http/create-fake-http-client';
import { createAuthRepository } from './create-repository';

const user = { id: 'user-1', email: 'a@example.com' };

describe('AuthRepository', () => {
  it('me는 성공 봉투의 사용자를 돌려준다', async () => {
    const http = createFakeHttpClient();
    http.stub('GET', '/auth/me', { status: 200, body: { ok: true, data: user } });

    expect(await createAuthRepository(http).me()).toEqual(user);
  });

  it('me는 401(미인증)이면 null이다 — 에러로 던지지 않는다', async () => {
    const http = createFakeHttpClient();
    http.stub('GET', '/auth/me', {
      status: 401,
      body: { ok: false, error: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' } },
    });

    expect(await createAuthRepository(http).me()).toBeNull();
  });

  it('me는 401이 아닌 실패 봉투면 ApiResponseError로 던진다', async () => {
    const http = createFakeHttpClient();
    http.stub('GET', '/auth/me', {
      status: 500,
      body: { ok: false, error: { code: 'INTERNAL', message: '서버 오류' } },
    });

    const result = createAuthRepository(http).me();

    await expect(result).rejects.toBeInstanceOf(ApiResponseError);
    await expect(result).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
  });
});
