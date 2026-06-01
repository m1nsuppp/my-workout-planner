import { z } from 'zod';
import type { LlmClient } from './client';

// LLM 호출 실패(네트워크·비정상 응답·형식 위반)를 한 종류로 모은다. 컨트롤러가 502로 변환한다.
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

// OpenRouter 응답에서 우리가 쓰는 부분만. 나머지 필드는 무시한다.
const ChatCompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const ERROR_PREVIEW_LEN = 200; // 비정상 응답 미리보기 길이

// OpenRouter REST를 LlmClient로 래핑. fetch를 주입받아(기본 전역) 테스트에서 fake로 바꾼다.
export function createOpenRouterClient(config: {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
}): LlmClient {
  const fetchFn = config.fetchFn ?? fetch;

  return {
    generate: async ({ system, messages, schema }) => {
      const res = await fetchFn(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          // JSON만 내도록 강제. 출력 스키마 자체는 system 프롬프트가 명세한다.
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });

      if (!res.ok) {
        throw new LlmError(`OpenRouter 요청 실패(${res.status}): ${await res.text()}`);
      }

      const parsed = ChatCompletionSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw new LlmError('OpenRouter 응답 형식이 예상과 다릅니다.');
      }

      const content = parsed.data.choices[0].message.content;
      let json: unknown = undefined;
      try {
        json = JSON.parse(content);
      } catch {
        throw new LlmError(
          `모델이 JSON이 아닌 응답을 반환했습니다: ${content.slice(0, ERROR_PREVIEW_LEN)}`,
        );
      }

      // 출력 스키마 위반은 LlmError로 승격 — 호출부가 LLM 실패로 일관되게 다룬다.
      const result = schema.safeParse(json);
      if (!result.success) {
        throw new LlmError(`모델 출력이 스키마와 맞지 않습니다: ${result.error.message}`);
      }

      return result.data;
    },
  };
}
