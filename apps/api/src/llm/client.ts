import type { z } from 'zod';

// LLM 호출 실패(네트워크·비정상 응답·형식 위반)를 한 종류로 모은다. 컨트롤러가 502로 변환한다.
// 추상 경계(인터페이스)에 두어, 호출부가 특정 제공자 구현 모듈에 결합되지 않게 한다.
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

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
