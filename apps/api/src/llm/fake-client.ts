import type { LlmClient, LlmMessage } from './client';

// 테스트용 LlmClient — 실제 모델 대신 주입된 responder의 "완성 결과 객체"를 받아
// message와 구조(나머지 필드)로 분해한다. 실제 client가 자연어+구분자로 하는 분해를 흉내낸다.
// responder가 시나리오(asking/proposing 등)를 결정한다. message는 onDelta로 통째 흘린다.
export function createFakeLlmClient(
  respond: (input: { system: string; messages: LlmMessage[] }) => Record<string, unknown>,
): LlmClient {
  return {
    generate: async ({ system, messages, schema }, onDelta) => {
      const { message, ...rest } = respond({ system, messages });
      const text = typeof message === 'string' ? message : '';
      await onDelta?.(text);

      return { message: text, data: schema.parse(rest) };
    },
  };
}
