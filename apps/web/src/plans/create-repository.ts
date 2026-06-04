import {
  ApiFailureSchema,
  CreatePlanResponseDto,
  GetPlanResponseDto,
  NextDayResponseDto,
  PlanChatResultDto,
} from '@workout/contracts';
import type { ApiResponse } from '@workout/contracts';
import { ApiResponseError } from '../shared/api-response-error';
import type { HttpClient, HttpResponse } from '../http/http-client';
import type { PlanRepository } from './repository';

const OK = 200;

export function createPlanRepository(http: HttpClient): PlanRepository {
  return {
    async get(id) {
      return unwrap(
        GetPlanResponseDto,
        await http.request({ method: 'GET', path: `/api/plans/${id}` }),
      );
    },
    async create(draft) {
      return unwrap(
        CreatePlanResponseDto,
        await http.request({ method: 'POST', path: '/api/plans', body: draft }),
      );
    },
    async nextDay(routineId) {
      return unwrap(
        NextDayResponseDto,
        await http.request({ method: 'GET', path: `/api/routines/${routineId}/next-day` }),
      );
    },
    async chat(input) {
      // chat은 ResultDto 규약상 성공이 봉투 없는 raw proposal이라 unwrap 대신 직접 분기한다.
      const response = await http.request({ method: 'POST', path: '/api/plans/chat', body: input });
      if (response.status !== OK) {
        throw new ApiResponseError(response.status, ApiFailureSchema.parse(response.body).error);
      }

      return PlanChatResultDto.parse(response.body);
    },
  };
}

// 봉투를 엔드포인트 DTO로 검증(서버가 깨진 응답을 내보내면 zod가 throw) →
// ok면 data, 실패 봉투면 ApiResponseError로 승격한다.
function unwrap<T>(
  schema: { parse: (value: unknown) => ApiResponse<T> },
  response: HttpResponse,
): T {
  const envelope = schema.parse(response.body);
  if (!envelope.ok) {
    throw new ApiResponseError(response.status, envelope.error);
  }

  return envelope.data;
}
