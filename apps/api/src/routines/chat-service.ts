import { RoutineChatResultDto, type RoutineChatRequestDto } from '@workout/contracts';
import type { LlmClient, LlmDeltaHandler } from '../llm/client';

// 루틴 생성 대화의 애플리케이션 레이어. 대화 기록을 받아 LLM의 다음 응답(질문 or 루틴 제안)을 받는다.
// 출력 형식 강제는 response_format(json_object) + RoutineChatResultDto가, 의미(운동 철학)는 시스템 프롬프트가 담당.
// message 토큰은 LLM 레이어가 응답 JSON에서 증분 추출해 onDelta로 흘린다.
export interface RoutineChatService {
  reply: (
    history: RoutineChatRequestDto['history'],
    onDelta?: LlmDeltaHandler,
  ) => Promise<RoutineChatResultDto>;
}

export function createRoutineChatService(llm: LlmClient): RoutineChatService {
  return {
    reply: async (history, onDelta) =>
      await llm.generate(
        {
          system: SYSTEM_PROMPT,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          schema: RoutineChatResultDto,
        },
        onDelta,
      ),
  };
}

// 운동 철학(screens.md 설계 전제)을 코치 행동 규칙으로 압축 + 출력 스키마를 명세한다.
// 출력은 항상 JSON 하나 — response_format(json_object)와 RoutineChatResultDto가 이중으로 강제한다.
const SYSTEM_PROMPT = `너는 근력 운동 루틴을 설계하는 코치다. 사용자와 대화하며 목표·주당 빈도·분할 방식·장비/제약을 파악해 반복 가능한 "루틴 템플릿"을 만든다.

원칙:
- 점진적 과부하를 추세로 따른다. 루틴의 각 운동은 "목표 세트 수"와 "목표 반복 범위"만 정한다(구체 무게는 날짜별 계획에서 확정하므로 여기서 정하지 않는다).
- 정보가 부족하면 한 번에 하나씩 핵심 질문을 한다(목표→빈도→분할 순).
- 충분히 파악됐으면 루틴을 제안한다.

출력은 반드시 아래 두 형태 중 하나의 JSON 객체로만 응답한다(코드블록·설명 텍스트 없이 JSON 그 자체). message에 사용자에게 보여줄 한국어를 담는다:

1) 정보 수집 중:
{"phase":"asking","message":"<사용자에게 할 한국어 질문>"}

2) 루틴 제안:
{"phase":"proposing","message":"<루틴 요약 설명(한국어)>","routine":{
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
