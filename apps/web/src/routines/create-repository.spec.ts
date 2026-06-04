import { describe, expect, it } from 'vitest';
import { ApiResponseError } from '../shared/api-response-error';
import { createFakeHttpClient } from '../http/create-fake-http-client';
import { createRoutineRepository } from './create-repository';
import type { RoutineDraft } from './repository';

const draft: RoutineDraft = {
  name: '상하체 분할',
  goal: 'hypertrophy',
  splitType: 'upper_lower',
  daysPerWeek: 4,
  days: [{ label: '상체 A', exercises: [] }],
};

// 서버 응답 본문(봉투 안 data) — 검증만 통과하면 되는 raw 형태라 stub에 그대로 넣는다.
const routine = { ...draft, id: 'r1', createdAt: '2026-05-01T00:00:00Z' };

describe('RoutineRepository', () => {
  it('list는 성공 봉투의 data를 도메인 배열로 돌려준다', async () => {
    const http = createFakeHttpClient();
    http.stub('GET', '/api/routines', { status: 200, body: { ok: true, data: [routine] } });

    const result = await createRoutineRepository(http).list();

    expect(result).toEqual([routine]);
  });

  it('create는 draft를 보내고 생성된 루틴을 돌려준다', async () => {
    const http = createFakeHttpClient();
    http.stub('POST', '/api/routines', { status: 201, body: { ok: true, data: routine } });

    const result = await createRoutineRepository(http).create(draft);

    expect(result).toEqual(routine);
  });

  it('chat 성공은 result 이벤트의 raw proposal을 돌려주고 토큰을 onDelta로 흘린다', async () => {
    const http = createFakeHttpClient();
    const proposal = { phase: 'asking', message: '운동 경력은요?' };
    http.stubStream('POST', '/api/routines/chat', {
      deltas: ['운동 ', '경력은요?'],
      outcome: { status: 200, event: 'result', data: proposal },
    });

    let streamed = '';
    const result = await createRoutineRepository(http).chat(
      [{ role: 'user', content: '루틴 짜줘' }],
      (t) => {
        streamed += t;
      },
    );

    expect(result).toEqual(proposal);
    expect(streamed).toBe('운동 경력은요?');
  });

  it('chat의 error 이벤트는 ApiResponseError로 승격한다', async () => {
    const http = createFakeHttpClient();
    http.stubStream('POST', '/api/routines/chat', {
      outcome: {
        status: 200,
        event: 'error',
        data: { code: 'LLM_FAILED', message: 'AI 응답 생성에 실패했어요.' },
      },
    });

    const result = createRoutineRepository(http).chat([{ role: 'user', content: 'x' }]);

    await expect(result).rejects.toBeInstanceOf(ApiResponseError);
    await expect(result).rejects.toMatchObject({ code: 'LLM_FAILED' });
  });

  it('실패 봉투는 code·status를 담은 ApiResponseError로 던진다', async () => {
    const http = createFakeHttpClient();
    http.stub('GET', '/api/routines/missing', {
      status: 404,
      body: { ok: false, error: { code: 'NOT_FOUND', message: '루틴을 찾을 수 없습니다.' } },
    });

    const result = createRoutineRepository(http).get('missing');

    await expect(result).rejects.toBeInstanceOf(ApiResponseError);
    await expect(result).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
