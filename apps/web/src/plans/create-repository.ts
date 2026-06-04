import {
  ApiErrorSchema,
  CoachApplyResponseDto,
  CoachResultDto,
  CreatePlanResponseDto,
  GetPlanResponseDto,
  ListPlansResponseDto,
  NextDayResponseDto,
  PlanChatResultDto,
  UpdateSetResponseDto,
} from '@workout/contracts';
import type { ApiResponse } from '@workout/contracts';
import { ApiResponseError } from '../shared/api-response-error';
import type { HttpClient, HttpResponse } from '../http/http-client';
import type { PlanRepository } from './repository';

export function createPlanRepository(http: HttpClient): PlanRepository {
  return {
    async get(id) {
      return unwrap(
        GetPlanResponseDto,
        await http.request({ method: 'GET', path: `/api/plans/${id}` }),
      );
    },
    async list(range) {
      const params = new URLSearchParams();
      if (range?.from !== undefined) {
        params.set('from', range.from);
      }
      if (range?.to !== undefined) {
        params.set('to', range.to);
      }
      const query = params.toString();

      return unwrap(
        ListPlansResponseDto,
        await http.request({ method: 'GET', path: `/api/plans${query === '' ? '' : `?${query}`}` }),
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
    async chat(input, onDelta) {
      // chat은 SSE — message 토큰은 onDelta로 흘리고, result 이벤트의 raw proposal을 돌려준다.
      const outcome = await http.stream(
        { method: 'POST', path: '/api/plans/chat', body: input },
        onDelta ?? (() => undefined),
      );
      if (outcome.event === 'error') {
        throw new ApiResponseError(outcome.status, ApiErrorSchema.parse(outcome.data));
      }

      return PlanChatResultDto.parse(outcome.data);
    },
    async updateStatus(planId, status) {
      return unwrap(
        GetPlanResponseDto,
        await http.request({ method: 'PATCH', path: `/api/plans/${planId}/status`, body: { status } }),
      );
    },
    async updateSet(setId, record) {
      return unwrap(
        UpdateSetResponseDto,
        await http.request({ method: 'PATCH', path: `/api/sets/${setId}`, body: record }),
      );
    },
    async coach(planId, history, onDelta) {
      // chat과 동일한 SSE 규약 — message 토큰은 onDelta로, result 이벤트의 raw CoachResponse를 돌려준다.
      const outcome = await http.stream(
        { method: 'POST', path: `/api/plans/${planId}/coach`, body: { history } },
        onDelta ?? (() => undefined),
      );
      if (outcome.event === 'error') {
        throw new ApiResponseError(outcome.status, ApiErrorSchema.parse(outcome.data));
      }

      return CoachResultDto.parse(outcome.data);
    },
    async applyCoach(planId, change, idempotencyKey) {
      return unwrap(
        CoachApplyResponseDto,
        await http.request({
          method: 'POST',
          path: `/api/plans/${planId}/coach/apply`,
          body: { change, idempotencyKey },
        }),
      );
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
