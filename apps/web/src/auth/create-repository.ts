import { MeResponseDto } from '@workout/contracts';
import { ApiResponseError } from '../shared/api-response-error';
import type { HttpClient } from '../http/http-client';
import type { AuthRepository } from './repository';

// 미인증 — me에서 유일하게 '정상 상태'로 흡수하는 status.
const UNAUTHENTICATED = 401;

export function createAuthRepository(http: HttpClient): AuthRepository {
  return {
    async me() {
      const response = await http.request({ method: 'GET', path: '/auth/me' });
      const envelope = MeResponseDto.parse(response.body);
      if (envelope.ok) {
        return envelope.data;
      }

      // 401(미인증)은 정상 상태 → null. 그 외 실패 봉투는 진짜 오류라 승격해 던진다.
      if (response.status === UNAUTHENTICATED) {
        return null;
      }

      throw new ApiResponseError(response.status, envelope.error);
    },
  };
}
