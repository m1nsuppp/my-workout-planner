import {
  ApiErrorSchema,
  CreateRoutineResponseDto,
  GetRoutineResponseDto,
  ListRoutinesResponseDto,
  RoutineChatResultDto,
} from '@workout/contracts';
import type { ApiResponse } from '@workout/contracts';
import { ApiResponseError } from '../shared/api-response-error';
import type { HttpClient, HttpResponse } from '../http/http-client';
import type { RoutineRepository } from './repository';

export function createRoutineRepository(http: HttpClient): RoutineRepository {
  return {
    async list() {
      return unwrap(
        ListRoutinesResponseDto,
        await http.request({ method: 'GET', path: '/api/routines' }),
      );
    },
    async get(id) {
      return unwrap(
        GetRoutineResponseDto,
        await http.request({ method: 'GET', path: `/api/routines/${id}` }),
      );
    },
    async create(draft) {
      return unwrap(
        CreateRoutineResponseDto,
        await http.request({ method: 'POST', path: '/api/routines', body: draft }),
      );
    },
    async chat(history, onDelta) {
      // chat은 SSE — message 토큰은 onDelta로 흘리고, result 이벤트의 raw proposal을 돌려준다.
      const outcome = await http.stream(
        { method: 'POST', path: '/api/routines/chat', body: { history } },
        onDelta ?? (() => undefined),
      );
      if (outcome.event === 'error') {
        throw new ApiResponseError(outcome.status, ApiErrorSchema.parse(outcome.data));
      }

      return RoutineChatResultDto.parse(outcome.data);
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
