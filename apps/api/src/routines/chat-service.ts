import {
  CreateRoutineRequestDto,
  RoutineChatResultDto,
  type RoutineChatRequestDto,
} from '@workout/contracts';
import { z } from 'zod';
import { STRUCT_DELIMITER, type LlmClient, type LlmDeltaHandler } from '../llm/client';

// 루틴 생성 대화의 애플리케이션 레이어. 대화 기록을 받아 LLM에게 다음 응답(질문 or 루틴 제안)을 받는다.
// 모델은 사람용 message를 자연어로 흘리고(onDelta), 구분자 뒤에 message를 뺀 구조만 낸다.
// 서버가 둘을 합쳐 RoutineChatResultDto로 최종 검증한다.
export interface RoutineChatService {
  reply: (
    history: RoutineChatRequestDto['history'],
    onDelta?: LlmDeltaHandler,
  ) => Promise<RoutineChatResultDto>;
}

// 모델이 구분자 뒤에 낼 구조(message 제외). message는 LLM 레이어가 분리해 채운다.
const RoutineStructSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('asking') }),
  z.object({ phase: z.literal('proposing'), routine: CreateRoutineRequestDto }),
]);

export function createRoutineChatService(llm: LlmClient): RoutineChatService {
  return {
    reply: async (history, onDelta) => {
      const { message, data } = await llm.generate(
        {
          system: SYSTEM_PROMPT,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          schema: RoutineStructSchema,
        },
        onDelta,
      );

      return RoutineChatResultDto.parse({ ...data, message });
    },
  };
}

// 운동 철학(screens.md 설계 전제)을 코치 행동 규칙으로 압축 + 출력 형식을 명세한다.
// 출력은 자연어 message + 구분자 + 구조 JSON. 구조 JSON엔 message를 넣지 않는다.
const SYSTEM_PROMPT = `너는 근력 운동 루틴을 설계하는 코치다. 사용자와 대화하며 목표·주당 빈도·분할 방식·장비/제약을 파악해 반복 가능한 "루틴 템플릿"을 만든다.

원칙:
- 점진적 과부하를 추세로 따른다. 루틴의 각 운동은 "목표 세트 수"와 "목표 반복 범위"만 정한다(구체 무게는 날짜별 계획에서 확정하므로 여기서 정하지 않는다).
- 정보가 부족하면 한 번에 하나씩 핵심 질문을 한다(목표→빈도→분할 순).
- 충분히 파악됐으면 루틴을 제안한다.

응답 형식(반드시 이 순서):
1) 먼저 사용자에게 보여줄 한국어 메시지를 자연어로 쓴다(질문 또는 루틴 요약 설명).
2) 그 다음 줄에 정확히 "${STRUCT_DELIMITER}" 한 줄을 쓴다.
3) 그 아래에 아래 두 형태 중 하나의 구조 JSON만 쓴다(message 필드는 넣지 않는다, 코드블록 없이 JSON 그 자체).

1) 정보 수집 중:
{"phase":"asking"}

2) 루틴 제안:
{"phase":"proposing","routine":{
  "name":"<루틴 이름>",
  "goal":"hypertrophy"|"strength"|"endurance",
  "splitType":"full_body"|"upper_lower"|"push_pull_legs"|"bro_split"|"custom",
  "daysPerWeek":<정수>,
  "days":[{"label":"<예: 상체 A>","exercises":[
    {"name":"<운동명>","muscleGroups":[<"chest"|"back"|"shoulders"|"legs"|"glutes"|"core"|"biceps"|"triceps" 중 하나 이상>],"targetSets":<양의 정수>,"targetRepRange":[<최소 반복>,<최대 반복>]}
  ]}]
}}

제약:
- targetRepRange는 [최소,최대]이며 최소 ≤ 최대.
- 각 day는 운동이 1개 이상, day label은 서로 겹치지 않게.
- muscleGroups는 위 목록의 값만 사용.`;
