import type { LlmClient, LlmMessage } from './client';

// 테스트용 LlmClient — 실제 모델 대신 주입된 responder의 완성 객체를 schema로 검증해 돌려준다.
// 실제 client처럼 message 필드를 onDelta로 흘려, 스트리밍 표시 경로도 fake로 검증되게 한다.
export function createFakeLlmClient(
  respond: (input: { system: string; messages: LlmMessage[] }) => Record<string, unknown>,
): LlmClient {
  return {
    generate: async ({ system, messages, schema }, onDelta) => {
      const whole = respond({ system, messages });
      if (typeof whole.message === 'string') {
        await onDelta?.(whole.message);
      }

      return await Promise.resolve(schema.parse(whole));
    },
  };
}
