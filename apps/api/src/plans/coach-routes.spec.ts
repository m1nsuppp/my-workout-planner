import { ApiFailureSchema, GetPlanResponseDto } from '@workout/contracts';
import { describe, expect, it } from 'vitest';
import { CoachApplyError, CoachIdempotencyError, InvalidPlanTransitionError } from './service';
import { appWith, authed, devEnv, parseSSE, sampleRecord, type FakeOpts } from './routes-fixtures';

describe('POST /api/plans/:id/coach', () => {
  const postCoach = async (opts: FakeOpts, body: unknown, authenticated = true) =>
    await appWith(opts).request(
      '/api/plans/p1/coach',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(authenticated ? authed : {}) },
        body: JSON.stringify(body),
      },
      devEnv,
    );

  const history = { history: [{ role: 'user', content: '벤치 자리가 없어요' }] };

  it('진행 중 plan이 있으면 200 SSE + result에 코치 응답', async () => {
    const res = await postCoach(
      { found: sampleRecord, coachReply: { message: '풀업으로 바꿔요.', change: null } },
      history,
    );
    expect(res.status).toBe(200);
    expect(parseSSE(await res.text()).result).toMatchObject({ message: '풀업으로 바꿔요.' });
  });

  it('없는 plan → 404 (스트림 전)', async () => {
    const res = await postCoach({ found: null }, history);
    expect(res.status).toBe(404);
  });

  it('인증 없음 → 401', async () => {
    const res = await postCoach({}, history, false);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/plans/:id/coach/apply', () => {
  const postApply = async (opts: FakeOpts, body: unknown, authenticated = true) =>
    await appWith(opts).request(
      '/api/plans/p1/coach/apply',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(authenticated ? authed : {}) },
        body: JSON.stringify(body),
      },
      devEnv,
    );

  const validApply = {
    change: { kind: 'adjust_load', targetExerciseName: '벤치프레스', weightFactor: 0.8, reason: '컨디션' },
    idempotencyKey: 'idem-1',
  };

  it('적용 성공 → 200 + 변형된 Plan', async () => {
    const res = await postApply({ coachApplied: sampleRecord }, validApply);
    expect(res.status).toBe(200);
    const json = GetPlanResponseDto.parse(await res.json());
    expect(json.ok).toBe(true);
  });

  it('잘못된 변경안(상향 weightFactor>1) → 422 VALIDATION_FAILED', async () => {
    const res = await postApply(
      { coachApplied: sampleRecord },
      { ...validApply, change: { ...validApply.change, weightFactor: 1.2 } },
    );
    expect(res.status).toBe(422);
  });

  it('규칙 위반(CoachApplyError) → 422 COACH_APPLY_INVALID', async () => {
    const res = await postApply({ coachError: new CoachApplyError(['대상 없음']) }, validApply);
    expect(res.status).toBe(422);
    expect(ApiFailureSchema.parse(await res.json()).error.code).toBe('COACH_APPLY_INVALID');
  });

  it('in_progress 아님(InvalidPlanTransitionError) → 409 INVALID_STATE_TRANSITION', async () => {
    const res = await postApply(
      { coachError: new InvalidPlanTransitionError('scheduled', 'coach_apply') },
      validApply,
    );
    expect(res.status).toBe(409);
    expect(ApiFailureSchema.parse(await res.json()).error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('멱등성 중복(CoachIdempotencyError) → 409 IDEMPOTENCY_CONFLICT', async () => {
    const res = await postApply({ coachError: new CoachIdempotencyError() }, validApply);
    expect(res.status).toBe(409);
    expect(ApiFailureSchema.parse(await res.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('없는 plan → 404', async () => {
    const res = await postApply({ coachApplied: null }, validApply);
    expect(res.status).toBe(404);
  });

  it('인증 없음 → 401', async () => {
    const res = await postApply({}, validApply, false);
    expect(res.status).toBe(401);
  });
});
