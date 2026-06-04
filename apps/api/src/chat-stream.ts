import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Env } from './env';
import { LlmError } from './llm/client';

// 대화 SSE 응답의 공통 프레이밍 — message 토큰을 event:delta로 흘리고,
// 최종 구조를 event:result로, 실패(LLM 등)를 event:error로 전달한다(api.md 스트림 규약).
// produce는 onDelta를 받아 chat-service.reply를 호출하고, 검증된 최종 페이로드를 반환한다.
export function streamChat(
  c: Context<{ Bindings: Env }>,
  produce: (onDelta: (text: string) => Promise<void>) => Promise<unknown>,
): Response {
  return streamSSE(c, async (stream) => {
    try {
      const result = await produce(async (text) => {
        await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text }) });
      });
      await stream.writeSSE({ event: 'result', data: JSON.stringify(result) });
    } catch (e) {
      const error =
        e instanceof LlmError
          ? { code: 'LLM_FAILED', message: 'AI 응답 생성에 실패했어요.' }
          : { code: 'INTERNAL', message: '서버 오류가 발생했어요.' };
      await stream.writeSSE({ event: 'error', data: JSON.stringify(error) });
    }
  });
}
