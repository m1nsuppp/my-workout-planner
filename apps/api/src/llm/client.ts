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
// 호출자는 "지시 + 대화 → 사람용 message + 이 스키마의 구조 객체"만 안다. 모델·프로토콜·파싱은 모른다.

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 모델 출력 프로토콜의 경계 표지. 이 줄 앞은 사람용 message(자연어), 뒤는 구조 JSON(message 제외).
// message는 토큰 단위로 흘리고(onDelta), 구조는 끝에 모아 검증한다. 프롬프트와 파서가 이 상수를 공유한다.
export const STRUCT_DELIMITER = '===STRUCT===';

// message 토큰이 도착할 때마다 호출되는 스트리밍 핸들러. 없으면 끝까지 모아 한 번에 반환만 한다.
// SSE 전송처럼 비동기 쓰기가 필요할 수 있어 Promise를 허용하고, 호출부는 순서 보장을 위해 await한다.
export type LlmDeltaHandler = (text: string) => void | Promise<void>;

// 한 번의 생성 결과 — 사람용 message와 schema로 검증된 구조 data를 분리해 돌려준다.
export interface LlmResult<T> {
  message: string;
  data: T;
}

export interface LlmClient {
  // schema로 구조 출력 형식을 강제한다. 모델 응답이 schema에 맞지 않으면 throw(깨진 출력을 숨기지 않음).
  // onDelta가 주어지면 message 토큰을 흘린다(SSE 전송용). 없으면 스트리밍 없이 최종 결과만.
  generate: <T>(
    input: {
      system: string;
      messages: LlmMessage[];
      schema: z.ZodType<T>;
    },
    onDelta?: LlmDeltaHandler,
  ) => Promise<LlmResult<T>>;
}
