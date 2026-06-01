import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmError, createOpenRouterClient } from './openrouter-client';

const schema = z.object({ phase: z.literal('asking'), message: z.string() });

// 모델 content를 담은 OpenRouter 성공 응답을 흉내내는 fake fetch.
function fetchReturning(content: string, status = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

describe('createOpenRouterClient', () => {
  const config = { apiKey: 'k', model: 'm' };

  it('모델이 낸 JSON을 스키마로 검증해 객체로 돌려준다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: fetchReturning(JSON.stringify({ phase: 'asking', message: '목표가 뭐예요?' })),
    });

    const result = await client.generate({ system: 's', messages: [], schema });

    expect(result).toEqual({ phase: 'asking', message: '목표가 뭐예요?' });
  });

  it('HTTP 실패는 LlmError로 던진다', async () => {
    const failFetch: typeof fetch = async () => new Response('rate limited', { status: 429 });
    const client = createOpenRouterClient({ ...config, fetchFn: failFetch });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it('모델이 JSON이 아닌 응답을 내면 LlmError로 던진다', async () => {
    const client = createOpenRouterClient({ ...config, fetchFn: fetchReturning('그냥 텍스트') });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it('모델 출력이 스키마를 위반하면 LlmError로 던진다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: fetchReturning(JSON.stringify({ phase: 'unknown' })),
    });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });
});
