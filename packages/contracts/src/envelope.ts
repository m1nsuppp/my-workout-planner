import { z } from 'zod';

// 모든 응답을 전부 봉투(full envelope)로 감싼다. 클라는 항상 ok부터 분기.

export const ApiErrorSchema = z.object({
  code: z.string(), // 기계 분기용 안정 코드. 'VALIDATION_FAILED' 등
  message: z.string(), // 사람용(화면 노출 가능)
  details: z.unknown().optional(), // Zod issues 등 부가정보
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiFailureSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
});
export type ApiFailure = z.infer<typeof ApiFailureSchema>;

// 성공 봉투 스키마 빌더 — data 스키마를 감싼다.
export function apiSuccessSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data });
}

// 응답 봉투 스키마 빌더 (성공 | 실패)
export function apiResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion('ok', [apiSuccessSchema(data), ApiFailureSchema]);
}

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
