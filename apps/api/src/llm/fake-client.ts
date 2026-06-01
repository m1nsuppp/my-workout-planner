import type { LlmClient, LlmMessage } from './client';

// 테스트용 LlmClient — 실제 모델 대신 주입된 responder의 반환을 schema로 검증해 돌려준다.
// responder가 시나리오(asking/proposing 등)를 결정한다.
export function createFakeLlmClient(
  respond: (input: { system: string; messages: LlmMessage[] }) => unknown,
): LlmClient {
  return {
    generate: async ({ system, messages, schema }) =>
      await Promise.resolve(schema.parse(respond({ system, messages }))),
  };
}
