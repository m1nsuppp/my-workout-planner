import {
  CreatePlanRequestDto,
  PlanChatResultDto,
  type PlanChatRequestDto,
} from '@workout/contracts';
import { z } from 'zod';
import type { LlmClient, LlmDeltaHandler } from '../llm/client';
import type { DayTemplateExercise, OverloadRecord } from './repository';

// 계획 생성 대화의 입력 컨텍스트 — 라우트가 저장소(template/overload)에서 조립해 넘긴다.
// chat-service는 영속을 모르고, 받은 컨텍스트로 LLM 호출만 한다(routine chat-service와 동일한 순수 래퍼).
export interface PlanChatContext {
  routineId: string;
  routineDayLabel: string;
  date: string;
  // 이 Day에 정의된 운동 종목(grounding). 모델은 이 목록을 벗어나 운동을 지어내지 않는다.
  template: DayTemplateExercise[];
  overloads: OverloadRecord[];
}

export interface PlanChatService {
  // draft = 사용자가 편집 중인 현재 카드 상태. 모델이 이를 수정해 항상 채워진 planDraft를 돌려준다.
  reply: (
    context: PlanChatContext,
    draft: PlanChatRequestDto['draft'],
    history: PlanChatRequestDto['history'],
    onDelta?: LlmDeltaHandler,
  ) => Promise<PlanChatResultDto>;
}

// LLM은 식별 필드(routineId/routineDayLabel/date)를 지어내지 않는다 — 운동 내용만 생성하고,
// 식별 필드는 서버가 컨텍스트에서 주입한다(모델이 brand 식별자/날짜를 날조하는 것을 원천 차단).
const LlmPlanContent = CreatePlanRequestDto.omit({
  routineId: true,
  routineDayLabel: true,
  date: true,
});
// LLM이 낼 JSON — 항상 message + planDraft(현재 카드의 수정본, 식별 필드 제외). 식별 필드는 서버가 주입한다.
const LlmPlanProposalSchema = z.object({
  message: z.string(),
  planDraft: LlmPlanContent,
});

export function createPlanChatService(llm: LlmClient): PlanChatService {
  return {
    reply: async (context, draft, history, onDelta) => {
      const result = await llm.generate(
        {
          system: buildSystemPrompt(context, draft),
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          schema: LlmPlanProposalSchema,
        },
        onDelta,
      );

      // 식별 필드를 서버가 주입해 PlanDraft를 완성하고 계약으로 최종 검증한다.
      return PlanChatResultDto.parse({
        message: result.message,
        planDraft: {
          routineId: context.routineId,
          routineDayLabel: context.routineDayLabel,
          date: context.date,
          ...result.planDraft,
        },
      });
    },
  };
}

// 운동 철학(과부하 비대칭 규칙)을 코치 행동 규칙으로 압축 + 컨텍스트(대상 Day·직전 기록)를 싣고 출력 스키마를 명세한다.
function buildSystemPrompt(context: PlanChatContext, draft: PlanChatRequestDto['draft']): string {
  return `너는 운동 계획을 짜는 코치다. 사용자의 루틴 한 "Day"를 특정 날짜에 적용해, 구체적인 무게·횟수를 확정한 "계획"을 만든다.

대상 Day: ${context.routineDayLabel}
날짜: ${context.date}

${formatTemplate(context.template)}

${formatOverloads(context.overloads)}

${formatDraft(draft)}

역할의 경계(중요):
- 대상 Day와 날짜는 이전 화면에서 이미 확정됐다. 이 대화에서 너는 Day를 바꿀 수 없다(예: Upper를 Lower로 바꿔달라고 해도 불가).
- 사용자가 다른 Day를 원하면, 동의하거나 그런 척하지 말고 "이전 화면으로 돌아가 다른 Day를 선택해 주세요"라고 안내한다.
- "조회할 권한이 없다" 같은 변명을 지어내지 않는다. 위에 주어진 정보가 네가 가진 전부이며, 그것만으로 판단한다.
- 위 운동 목록이 이 계획의 기본 범위다. 사용자가 명시적으로 교체/추가/삭제를 요청할 때만 종목을 바꾸고, 그 외에는 이 종목들의 무게·횟수만 확정한다.

점진적 과부하 규칙(과학적 근거 — 상향은 비대칭적으로 신중히):
- 상향(↑)은 "직전 동일 Day" 기록의 RIR이 높았을(여유 있었을) 때만 신중히 적용한다(예: RIR이 3 이상이면 2.5kg 소폭 증량). 사용자의 "오늘 잘 된다"는 즉석 신호는 신뢰하지 않는다.
- 직전 기록이 없으면 보수적인 무게로 시작한다.
- 무게는 2.5kg 단위로 제안한다.
- 증량을 적용하면 그 근거를 overloadNote에 한국어로 명시한다(예: "지난 벤치 RIR 3 → 2.5kg 증량").

동작 방식(하이브리드 카드):
- 사용자에겐 위 "현재 카드"가 편집 가능한 화면으로 보인다. 너의 응답은 항상 그 카드의 다음 상태(planDraft)를 통째로 담는다.
- 사용자 발화를 반영해 카드를 수정한다(예: "스쿼트 50으로" → 스쿼트 무게를 50으로). 언급되지 않은 종목·세트는 현재 카드 값을 그대로 유지한다.
- 되묻고 싶을 땐 message에 질문을 담되, planDraft는 여전히 현재 최선의 카드 상태로 채운다(빈 제안 금지). 사용자는 카드를 직접 수정할 수도 있으므로 카드는 늘 확정 가능한 상태여야 한다.
- 무게가 아직 정해지지 않은 첫 수행 종목은 targetWeightKg를 0으로 두고, message로 무게를 물어본다.

출력은 반드시 아래 한 형태의 JSON 객체로만 응답한다(코드블록·설명 텍스트 없이 JSON 그 자체). routineId·routineDayLabel·date는 서버가 채우므로 너는 포함하지 않는다.

{"message":"<사용자에게 보여줄 한국어(코멘트 또는 질문)>","planDraft":{
  "exercises":[
    {"name":"<운동명>","muscleGroups":[<"chest"|"back"|"shoulders"|"legs"|"glutes"|"core"|"biceps"|"triceps" 중 하나 이상>],"sets":[{"targetWeightKg":<0 이상 숫자>,"targetReps":<양의 정수>}],"note":"<선택: 한 줄 메모>"}
  ],
  "overloadNote":"<선택: 증량 근거>"
}}

제약:
- muscleGroups는 위 목록의 값만 사용.
- 각 운동은 세트가 1개 이상, targetReps는 양의 정수.`;
}

// 현재 카드 상태를 프롬프트에 싣는다 — 모델이 이 값을 기준으로 수정한다(언급 안 된 값은 유지).
function formatDraft(draft: PlanChatRequestDto['draft']): string {
  if (draft.exercises.length === 0) {
    return '현재 카드: 아직 비어 있음. 위 정의된 운동을 토대로 카드를 채운다.';
  }

  const lines = draft.exercises.map((ex) => {
    const sets = ex.sets.map((s) => `${s.targetWeightKg}kg×${s.targetReps}회`).join(', ');

    return `- ${ex.name}: ${sets}`;
  });

  return `현재 카드(이 값을 기준으로 수정한다):\n${lines.join('\n')}`;
}

function formatTemplate(template: DayTemplateExercise[]): string {
  if (template.length === 0) {
    return '이 Day에 정의된 운동: 없음. 사용자에게 어떤 운동을 할지 직접 물어 계획을 구성한다.';
  }

  const lines = template.map((e) => {
    const [min, max] = e.targetRepRange;
    const reps = min === max ? `${min}회` : `${min}~${max}회`;

    return `- ${e.name}(${e.muscleGroups.join('/')}): 목표 ${e.targetSets}세트 × ${reps}`;
  });

  return `이 Day에 정의된 운동(계획의 기본 범위):\n${lines.join('\n')}`;
}

function formatOverloads(overloads: OverloadRecord[]): string {
  if (overloads.length === 0) {
    return '직전 동일 Day 수행 기록: 없음(첫 수행). 보수적으로 시작한다.';
  }

  const lines = overloads.map((o) => {
    const sets = o.sets.map((s) => `${s.weightKg}kg×${s.reps}회(RIR ${s.rir})`).join(', ');

    return `- ${o.exerciseName}: ${sets === '' ? '실제 기록 없음' : sets}`;
  });

  return `직전 동일 Day 수행 기록(증량 판단 근거):\n${lines.join('\n')}`;
}
