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

  it('chat 성공은 봉투 없는 raw proposal을 그대로 돌려준다', async () => {
    const http = createFakeHttpClient();
    const proposal = { phase: 'asking', message: '컨디션 어때요?' };
    http.stub('POST', '/api/plans/chat', { status: 200, body: proposal });

    const result = await createPlanRepository(http).chat({
      routineId: 'r1',
      routineDayLabel: '상체 A',
      date: '2026-05-25',
      history: [{ role: 'user', content: '계획 짜줘' }],
    });

    expect(result).toEqual(proposal);
  });

  it('chat 실패(비200)는 봉투를 ApiResponseError로 승격한다', async () => {
    const http = createFakeHttpClient();
    http.stub('POST', '/api/plans/chat', {
      status: 502,
      body: { ok: false, error: { code: 'LLM_FAILED', message: 'AI 응답 생성에 실패했어요.' } },
    });

    const result = createPlanRepository(http).chat({
      routineId: 'r1',
      routineDayLabel: '상체 A',
      date: '2026-05-25',
      history: [],
    });

    await expect(result).rejects.toBeInstanceOf(ApiResponseError);
    await expect(result).rejects.toMatchObject({ code: 'LLM_FAILED', status: 502 });
  });
});
