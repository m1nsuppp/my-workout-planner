import type { z } from 'zod';

// LLM 대화의 사용처 관점 인터페이스 — 외부 제공자(OpenRouter 등)를 이 뒤에 숨긴다.
// 호출자는 "지시 + 대화 → 이 스키마의 객체"만 안다. 모델·프로토콜·JSON 파싱은 모른다.

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmClient {
  // schema로 출력 형식을 강제한다. 모델 응답이 schema에 맞지 않으면 throw(깨진 출력을 숨기지 않음).
  generate: <T>(input: {
    system: string;
    messages: LlmMessage[];
    schema: z.ZodType<T>;
  }) => Promise<T>;
}
