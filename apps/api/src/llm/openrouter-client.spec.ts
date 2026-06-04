import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmError } from './client';
import { createOpenRouterClient } from './openrouter-client';

// 출력 JSON에는 message가 포함된다(response_format json_object가 형식을 강제).
const schema = z.object({ phase: z.literal('asking'), message: z.string() });

// 모델 출력 JSON 조각들을 OpenRouter SSE 스트림처럼 흘리는 fake fetch.
function streamFetch(parts: string[], status = 200): typeof fetch {
  return async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const p of parts) {
          const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`;
          controller.enqueue(enc.encode(frame));
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, { status });
  };
}

describe('createOpenRouterClient', () => {
  const config = { apiKey: 'k', model: 'm' };

  it('JSON을 모아 스키마로 검증하고, message 필드 증분을 onDelta로 흘린다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: streamFetch(['{"phase":"asking",', '"message":"목표가 ', '뭐예요?"}']),
    });

    let streamed = '';
    const result = await client.generate({ system: 's', messages: [], schema }, (t) => {
      streamed += t;
    });

    expect(result).toEqual({ phase: 'asking', message: '목표가 뭐예요?' });
    expect(streamed).toBe('목표가 뭐예요?');
  });

  it('onDelta 없이도 최종 결과를 모아 돌려준다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: streamFetch(['{"phase":"asking","message":"안녕"}']),
    });

    const result = await client.generate({ system: 's', messages: [], schema });

    expect(result).toEqual({ phase: 'asking', message: '안녕' });
  });

  it('HTTP 실패는 LlmError로 던진다', async () => {
    const failFetch: typeof fetch = async () => new Response('rate limited', { status: 429 });
    const client = createOpenRouterClient({ ...config, fetchFn: failFetch });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it('JSON이 아니면 LlmError로 던진다', async () => {
    const client = createOpenRouterClient({ ...config, fetchFn: streamFetch(['그냥 텍스트']) });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it('스키마를 위반하면 LlmError로 던진다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: streamFetch(['{"phase":"unknown"}']),
    });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });
});
