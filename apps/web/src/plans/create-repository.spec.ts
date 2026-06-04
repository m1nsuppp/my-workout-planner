import { describe, expect, it } from 'vitest';
import { CreatePlanRequestDto } from '@workout/contracts';
import { ApiResponseError } from '../shared/api-response-error';
import { createFakeHttpClient } from '../http/create-fake-http-client';
import { createPlanRepository } from './create-repository';

// routineId·date가 brand 타입이라 평문 객체로 못 만든다 — 계약 DTO로 parse해 검증 통과분을 쓴다.
const draft = CreatePlanRequestDto.parse({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [{ name: '벤치', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] }],
});
// 저장된 계획은 세트마다 id가 붙는다(draft엔 없음) — get/create 응답은 이 형태로 검증된다.
const plan = {
  ...draft,
  id: 'p1',
  status: 'scheduled',
  createdAt: '2026-05-25T00:00:00.000Z',
  exercises: [
    {
      name: '벤치',
      muscleGroups: ['chest'],
      sets: [{ id: 's1', targetWeightKg: 50, targetReps: 8 }],
    },
  ],
};

describe('PlanRepository', () => {
  it('get은 성공 봉투의 data를 도메인으로 돌려준다', async () => {
    const http = createFakeHttpClient();
    http.stub('GET', '/api/plans/p1', { status: 200, body: { ok: true, data: plan } });

    expect(await createPlanRepository(http).get('p1')).toEqual(plan);
  });

  it('create는 draft를 보내고 생성된 계획을 돌려준다', async () => {
    const http = createFakeHttpClient();
    http.stub('POST', '/api/plans', { status: 201, body: { ok: true, data: plan } });

    expect(await createPlanRepository(http).create(draft)).toEqual(plan);
  });

  it('nextDay는 다음 차례 Day를 돌려준다', async () => {
    const http = createFakeHttpClient();
    http.stub('GET', '/api/routines/r1/next-day', {
      status: 200,
      body: { ok: true, data: { routineDayId: 'd1', label: '상체 A' } },
    });

    expect(await createPlanRepository(http).nextDay('r1')).toEqual({
      routineDayId: 'd1',
      label: '상체 A',
    });
  });

  it('chat 성공은 result 이벤트의 raw proposal을 돌려주고 토큰을 onDelta로 흘린다', async () => {
    const http = createFakeHttpClient();
    const proposal = { phase: 'asking', message: '컨디션 어때요?' };
    http.stubStream('POST', '/api/plans/chat', {
      deltas: ['컨디션 ', '어때요?'],
      outcome: { status: 200, event: 'result', data: proposal },
    });

    let streamed = '';
    const result = await createPlanRepository(http).chat(
      {
        routineId: 'r1',
        routineDayLabel: '상체 A',
        date: '2026-05-25',
        history: [{ role: 'user', content: '계획 짜줘' }],
      },
      (t) => {
        streamed += t;
      },
    );

    expect(result).toEqual(proposal);
    expect(streamed).toBe('컨디션 어때요?');
  });

  it('chat의 error 이벤트는 ApiResponseError로 승격한다', async () => {
    const http = createFakeHttpClient();
    http.stubStream('POST', '/api/plans/chat', {
      outcome: {
        status: 200,
        event: 'error',
        data: { code: 'LLM_FAILED', message: 'AI 응답 생성에 실패했어요.' },
      },
    });

    const result = createPlanRepository(http).chat({
      routineId: 'r1',
      routineDayLabel: '상체 A',
      date: '2026-05-25',
      history: [],
    });

    await expect(result).rejects.toBeInstanceOf(ApiResponseError);
    await expect(result).rejects.toMatchObject({ code: 'LLM_FAILED' });
  });

  it('updateStatus는 상태를 보내고 갱신된 계획을 돌려준다', async () => {
    const http = createFakeHttpClient();
    const started = { ...plan, status: 'in_progress' };
    http.stub('PATCH', '/api/plans/p1/status', { status: 200, body: { ok: true, data: started } });

    const result = await createPlanRepository(http).updateStatus('p1', 'in_progress');

    expect(result.status).toBe('in_progress');
  });

  it('updateSet은 기록을 보내고 갱신된 세트를 돌려준다', async () => {
    const http = createFakeHttpClient();
    const updatedSet = {
      id: 's1',
      targetWeightKg: 50,
      targetReps: 8,
      actual: { weightKg: 52.5, reps: 7, rir: 1, completedAt: '2026-05-25T10:00:00.000Z' },
    };
    http.stub('PATCH', '/api/sets/s1', { status: 200, body: { ok: true, data: updatedSet } });

    const result = await createPlanRepository(http).updateSet('s1', { weightKg: 52.5, reps: 7, rir: 1 });

    expect(result.actual?.rir).toBe(1);
  });

  it('updateStatus 실패 봉투는 ApiResponseError로 승격한다', async () => {
    const http = createFakeHttpClient();
    http.stub('PATCH', '/api/plans/p1/status', {
      status: 409,
      body: { ok: false, error: { code: 'INVALID_STATE_TRANSITION', message: '전이 불가' } },
    });

    const result = createPlanRepository(http).updateStatus('p1', 'in_progress');

    await expect(result).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION', status: 409 });
  });

  it('list는 요약 배열을 돌려준다', async () => {
    const http = createFakeHttpClient();
    const summaries = [
      { id: 'p1', date: '2026-05-25', status: 'scheduled', routineDayLabel: '상체 A', exerciseCount: 3 },
    ];
    http.stub('GET', '/api/plans', { status: 200, body: { ok: true, data: summaries } });

    expect(await createPlanRepository(http).list()).toEqual(summaries);
  });

  it('list는 from/to를 쿼리로 보낸다', async () => {
    const http = createFakeHttpClient();
    http.stub('GET', '/api/plans?from=2026-05-01&to=2026-05-31', {
      status: 200,
      body: { ok: true, data: [] },
    });

    expect(await createPlanRepository(http).list({ from: '2026-05-01', to: '2026-05-31' })).toEqual(
      [],
    );
  });

  it('coach는 result 이벤트의 CoachResponse를 돌려준다', async () => {
    const http = createFakeHttpClient();
    http.stubStream('POST', '/api/plans/p1/coach', {
      deltas: ['풀업으로 ', '바꿔요'],
      outcome: { status: 200, event: 'result', data: { message: '풀업으로 바꿔요', change: null } },
    });

    const result = await createPlanRepository(http).coach('p1', [{ role: 'user', content: '자리 없어요' }]);

    expect(result).toEqual({ message: '풀업으로 바꿔요', change: null });
  });

  it('applyCoach는 변경안을 보내고 변형된 Plan을 돌려준다', async () => {
    const http = createFakeHttpClient();
    http.stub('POST', '/api/plans/p1/coach/apply', { status: 200, body: { ok: true, data: plan } });

    const result = await createPlanRepository(http).applyCoach(
      'p1',
      { kind: 'adjust_load', targetExerciseName: '벤치', weightFactor: 0.8, reason: '컨디션' },
      'idem-1',
    );

    expect(result).toEqual(plan);
  });
});
