import { CreatePlanRequestDto, PlanChatResultDto, type PlanChatRequestDto } from '@workout/contracts';
import { z } from 'zod';
import type { LlmClient } from '../llm/client';
import type { OverloadRecord } from './repository';

// 계획 생성 대화의 입력 컨텍스트 — 라우트가 저장소(nextDay/lastOverload)에서 조립해 넘긴다.
// chat-service는 영속을 모르고, 받은 컨텍스트로 LLM 호출만 한다(routine chat-service와 동일한 순수 래퍼).
export interface PlanChatContext {
  routineId: string;
  routineDayLabel: string;
  date: string;
  overloads: OverloadRecord[];
}

export interface PlanChatService {
  reply: (
    context: PlanChatContext,
    history: PlanChatRequestDto['history'],
  ) => Promise<PlanChatResultDto>;
}

// LLM은 식별 필드(routineId/routineDayLabel/date)를 지어내지 않는다 — 운동 내용만 생성하고,
// 식별 필드는 서버가 컨텍스트에서 주입한다(모델이 brand 식별자/날짜를 날조하는 것을 원천 차단).
const LlmPlanContent = CreatePlanRequestDto.omit({
  routineId: true,
  routineDayLabel: true,
  date: true,
});
const LlmPlanProposalSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('asking'), message: z.string() }),
  z.object({ phase: z.literal('proposing'), message: z.string(), planDraft: LlmPlanContent }),
]);

export function createPlanChatService(llm: LlmClient): PlanChatService {
  return {
    reply: async (context, history) => {
      const result = await llm.generate({
        system: buildSystemPrompt(context),
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        schema: LlmPlanProposalSchema,
      });

      if (result.phase === 'asking') {
        return result;
      }

      // proposing — 식별 필드를 서버가 주입해 PlanDraft를 완성하고 계약으로 최종 검증한다.
      return PlanChatResultDto.parse({
        phase: 'proposing',
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
function buildSystemPrompt(context: PlanChatContext): string {
  return `너는 운동 계획을 짜는 코치다. 사용자의 루틴 한 "Day"를 특정 날짜에 적용해, 구체적인 무게·횟수를 확정한 "계획"을 만든다.

대상 Day: ${context.routineDayLabel}
날짜: ${context.date}

${formatOverloads(context.overloads)}

점진적 과부하 규칙(과학적 근거 — 상향은 비대칭적으로 신중히):
- 상향(↑)은 "직전 동일 Day" 기록의 RIR이 높았을(여유 있었을) 때만 신중히 적용한다(예: RIR이 3 이상이면 2.5kg 소폭 증량). 사용자의 "오늘 잘 된다"는 즉석 신호는 신뢰하지 않는다.
- 직전 기록이 없으면 보수적인 무게로 시작한다.
- 무게는 2.5kg 단위로 제안한다.
- 증량을 적용하면 그 근거를 overloadNote에 한국어로 명시한다(예: "지난 벤치 RIR 3 → 2.5kg 증량").

정보가 부족하면(오늘 컨디션 등) 한 번에 하나씩 핵심 질문을 한다. 충분히 파악됐으면 계획을 제안한다.

출력은 반드시 아래 두 형태 중 하나의 JSON 객체로만 응답한다(코드블록·설명 텍스트 없이 JSON 그 자체). routineId·routineDayLabel·date는 서버가 채우므로 너는 포함하지 않는다.

1) 정보 수집 중:
{"phase":"asking","message":"<사용자에게 할 한국어 질문>"}

2) 계획 제안:
{"phase":"proposing","message":"<계획 요약 설명(한국어)>","planDraft":{
  "exercises":[
    {"name":"<운동명>","muscleGroups":[<"chest"|"back"|"shoulders"|"legs"|"glutes"|"core"|"biceps"|"triceps" 중 하나 이상>],"sets":[{"targetWeightKg":<0 이상 숫자>,"targetReps":<양의 정수>}],"note":"<선택: 한 줄 메모>"}
  ],
  "overloadNote":"<선택: 증량 근거>"
}}

제약:
- muscleGroups는 위 목록의 값만 사용.
- 각 운동은 세트가 1개 이상, targetReps는 양의 정수.`;
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
