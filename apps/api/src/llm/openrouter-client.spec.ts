import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmError, STRUCT_DELIMITER } from './client';
import { createOpenRouterClient } from './openrouter-client';

// 구조 스키마는 message를 제외한 부분만 검증한다(message는 자연어로 따로 흘러온다).
const schema = z.object({ phase: z.literal('asking') });

// 모델 출력 조각들을 OpenRouter SSE 스트림처럼 흘리는 fake fetch.
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

  it('message와 구조를 분해해 돌려주고, message 토큰을 onDelta로 흘린다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: streamFetch(['목표가 ', '뭐예요?', `\n${STRUCT_DELIMITER}\n`, '{"phase":"asking"}']),
    });

    let streamed = '';
    const result = await client.generate({ system: 's', messages: [], schema }, (t) => {
      streamed += t;
    });

    expect(result).toEqual({ message: '목표가 뭐예요?', data: { phase: 'asking' } });
    expect(streamed.trim()).toBe('목표가 뭐예요?');
  });

  it('onDelta 없이도 최종 결과를 모아 돌려준다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: streamFetch([`안녕\n${STRUCT_DELIMITER}\n{"phase":"asking"}`]),
    });

    const result = await client.generate({ system: 's', messages: [], schema });

    expect(result).toEqual({ message: '안녕', data: { phase: 'asking' } });
  });

  it('HTTP 실패는 LlmError로 던진다', async () => {
    const failFetch: typeof fetch = async () => new Response('rate limited', { status: 429 });
    const client = createOpenRouterClient({ ...config, fetchFn: failFetch });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it('구분자가 없으면 LlmError로 던진다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: streamFetch(['그냥 텍스트만 흘리고 끝']),
    });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it('구조 텍스트가 JSON이 아니면 LlmError로 던진다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: streamFetch([`설명\n${STRUCT_DELIMITER}\nnot-json`]),
    });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it('구조가 스키마를 위반하면 LlmError로 던진다', async () => {
    const client = createOpenRouterClient({
      ...config,
      fetchFn: streamFetch([`설명\n${STRUCT_DELIMITER}\n{"phase":"unknown"}`]),
    });

    await expect(client.generate({ system: 's', messages: [], schema })).rejects.toBeInstanceOf(
      LlmError,
    );
  });
});
