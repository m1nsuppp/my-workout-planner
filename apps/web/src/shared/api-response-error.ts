import type { ApiError } from '@workout/contracts';

// 서버가 실패 봉투(ok:false)를 돌려줬을 때 repository가 던지는 에러.
// 호출측은 code로 분기한다(예: 'NOT_FOUND', 'UNAUTHENTICATED', 'VALIDATION_FAILED').
export class ApiResponseError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'ApiResponseError';
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}
