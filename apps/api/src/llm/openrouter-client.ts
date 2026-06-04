import { z } from 'zod';
import { LlmError, type LlmClient, type LlmDeltaHandler } from './client';

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
const ESCAPE_PAIR_LEN = 2; // 백슬래시 + 이스케이프 문자
// 출력 JSON에서 사람용 message 필드의 값을 찾는 패턴. 우리 스키마는 message 키가 하나뿐이다.
const MESSAGE_KEY = /"message"\s*:\s*"/;

// OpenRouter REST를 LlmClient로 래핑. fetch를 주입받아(기본 전역) 테스트에서 fake로 바꾼다.
// response_format(json_object)으로 모델이 유효 JSON 하나만 내도록 강제하고, 스키마 자체는 system 프롬프트가 명세한다.
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
          response_format: { type: 'json_object' },
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
      const content = await consumeStream(res.body.pipeThrough(new TextDecoderStream()), onDelta);

      let json: unknown = undefined;
      try {
        json = JSON.parse(content);
      } catch {
        throw new LlmError(
          `모델이 JSON이 아닌 응답을 반환했습니다: ${content.slice(0, ERROR_PREVIEW_LEN)}`,
        );
      }

      const result = schema.safeParse(json);
      if (!result.success) {
        throw new LlmError(`모델 출력이 스키마와 맞지 않습니다: ${result.error.message}`);
      }

      return result.data;
    },
  };
}

// SSE 본문을 끝까지 읽어 전체 출력 JSON 텍스트를 모으고, message 필드가 자라는 만큼 증분을 onDelta로 흘린다.
async function consumeStream(
  stream: ReadableStream<string>,
  onDelta?: LlmDeltaHandler,
): Promise<string> {
  const reader = stream.getReader();
  let sseBuf = ''; // SSE 라인 파싱 버퍼
  let content = ''; // 누적 모델 출력(JSON)
  let sentLen = 0; // onDelta로 흘린 message 길이

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    sseBuf += value;

    let nl = sseBuf.indexOf('\n');
    while (nl !== -1) {
      const piece = parseDataLine(sseBuf.slice(0, nl).trim());
      sseBuf = sseBuf.slice(nl + 1);
      if (piece !== null) {
        content += piece;
        const message = messageSoFar(content);
        if (message !== null && message.length > sentLen) {
          await onDelta?.(message.slice(sentLen));
          sentLen = message.length;
        }
      }
      nl = sseBuf.indexOf('\n');
    }
  }

  return content;
}

// 누적 JSON 버퍼에서 message 필드의 "현재까지 디코드된 값"을 뽑는다. 아직 값이 시작 안 됐으면 null.
// 닫는 따옴표(escape 안 된 ")를 만나거나 버퍼가 끝나면 멈춘다 — 스트리밍 중엔 부분 값을 돌려준다.
function messageSoFar(buf: string): string | null {
  const m = MESSAGE_KEY.exec(buf);
  if (m === null) {
    return null;
  }
  let i = m.index + m[0].length;
  let out = '';
  while (i < buf.length) {
    const c = buf[i];
    if (c === '\\') {
      if (i + 1 >= buf.length) {
        break; // escape 시퀀스가 아직 안 옴
      }
      out += unescapeChar(buf[i + 1]);
      i += ESCAPE_PAIR_LEN;
    } else if (c === '"') {
      break; // 값의 끝
    } else {
      out += c;
      i += 1;
    }
  }

  return out;
}

function unescapeChar(c: string): string {
  switch (c) {
    case 'n':
      return '\n';
    case 't':
      return '\t';
    case 'r':
      return '\r';
    default:
      return c; // ", \, / 등은 그대로(한글 등 본문은 escape되지 않는다)
  }
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
