import { z } from 'zod';
import {
  LlmError,
  STRUCT_DELIMITER,
  type LlmClient,
  type LlmDeltaHandler,
} from './client';

// 스트림 청크에서 우리가 쓰는 부분만(증분 content). role-only 청크는 content가 없을 수 있다.
const ChunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullish() }).nullish() }))
    .min(1),
});

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const ERROR_PREVIEW_LEN = 200; // 비정상 응답 미리보기 길이
const DATA_PREFIX = 'data:';
const DONE = '[DONE]';

// OpenRouter REST를 LlmClient로 래핑. fetch를 주입받아(기본 전역) 테스트에서 fake로 바꾼다.
// 출력은 자연어 message + STRUCT_DELIMITER + 구조 JSON 형태로 흘러온다(system 프롬프트가 강제).
export function createOpenRouterClient(config: {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
}): LlmClient {
  const fetchFn = config.fetchFn ?? fetch;

  return {
    generate: async ({ system, messages, schema }, onDelta) => {
      const res = await fetchFn(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });

      if (!res.ok) {
        throw new LlmError(`OpenRouter 요청 실패(${res.status}): ${await res.text()}`);
      }
      if (res.body === null) {
        throw new LlmError('OpenRouter 응답에 스트림 본문이 없습니다.');
      }

      // 바이트 스트림을 문자열 스트림으로 디코딩(멀티바이트 경계는 TextDecoderStream이 처리).
      const { message, structText } = await consumeStream(
        res.body.pipeThrough(new TextDecoderStream()),
        onDelta,
      );

      let json: unknown = undefined;
      try {
        json = JSON.parse(structText);
      } catch {
        throw new LlmError(
          `모델이 구조 JSON이 아닌 응답을 반환했습니다: ${structText.slice(0, ERROR_PREVIEW_LEN)}`,
        );
      }

      const result = schema.safeParse(json);
      if (!result.success) {
        throw new LlmError(`모델 출력이 스키마와 맞지 않습니다: ${result.error.message}`);
      }

      return { message, data: result.data };
    },
  };
}

// SSE 본문을 끝까지 읽어, 구분자 앞 message(토큰을 onDelta로 흘림)와 구분자 뒤 구조 텍스트로 분해한다.
async function consumeStream(
  stream: ReadableStream<string>,
  onDelta?: LlmDeltaHandler,
): Promise<{ message: string; structText: string }> {
  const reader = stream.getReader();
  // 구분자가 청크 경계에 걸칠 수 있으므로, 끝부분 (구분자 길이 - 1)만큼은 흘리지 않고 보류한다.
  const lookback = STRUCT_DELIMITER.length - 1;

  let sseBuf = ''; // SSE 라인 파싱 버퍼
  let content = ''; // 누적 모델 출력
  let sentLen = 0; // onDelta로 흘린 message 길이
  let structStarted = false;

  const pump = (piece: string): void => {
    content += piece;
    if (structStarted) {
      return;
    }
    const idx = content.indexOf(STRUCT_DELIMITER);
    if (idx === -1) {
      const safe = content.length - lookback;
      if (safe > sentLen) {
        onDelta?.(content.slice(sentLen, safe));
        sentLen = safe;
      }

      return;
    }
    if (idx > sentLen) {
      onDelta?.(content.slice(sentLen, idx));
    }
    sentLen = idx;
    structStarted = true;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    sseBuf += value;

    let nl = sseBuf.indexOf('\n');
    while (nl !== -1) {
      const line = sseBuf.slice(0, nl).trim();
      sseBuf = sseBuf.slice(nl + 1);
      const piece = parseDataLine(line);
      if (piece !== null) {
        pump(piece);
      }
      nl = sseBuf.indexOf('\n');
    }
  }

  const idx = content.indexOf(STRUCT_DELIMITER);
  if (idx === -1) {
    throw new LlmError('모델 출력에 구조 구분자가 없습니다.');
  }

  return {
    message: content.slice(0, idx).trim(),
    structText: content.slice(idx + STRUCT_DELIMITER.length),
  };
}

// SSE 한 줄에서 증분 content를 뽑는다. data 라인이 아니거나 content가 없으면 null.
function parseDataLine(line: string): string | null {
  if (!line.startsWith(DATA_PREFIX)) {
    return null;
  }
  const data = line.slice(DATA_PREFIX.length).trim();
  if (data === DONE) {
    return null;
  }

  let json: unknown = undefined;
  try {
    json = JSON.parse(data);
  } catch {
    return null; // 깨진 청크는 건너뛴다(스트림은 계속).
  }

  const parsed = ChunkSchema.safeParse(json);

  return parsed.success ? (parsed.data.choices[0].delta?.content ?? null) : null;
}
