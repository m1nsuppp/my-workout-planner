import { CoachResultDto, type CoachRequestDto } from '@workout/contracts';
import { z } from 'zod';
import { STRUCT_DELIMITER, type LlmClient, type LlmDeltaHandler } from '../llm/client';
import type { PlanExerciseRecord } from './repository';

// 코치가 보는 현재 세션 스냅샷(LLM 컨텍스트) — 라우트가 진행 중 plan에서 조립해 넘긴다.
// 계약에 노출하지 않는 서버 내부 타입(api.md "타입의 거처").
export interface LiveSessionView {
  routineDayLabel: string;
  exercises: PlanExerciseRecord[]; // 목표 + 지금까지의 actual
}

export interface CoachService {
  reply: (
    session: LiveSessionView,
    history: CoachRequestDto['history'],
    onDelta?: LlmDeltaHandler,
  ) => Promise<CoachResultDto>;
}

// 모델이 구분자 뒤에 낼 구조(message 제외). 세트 id·근육군 enum 등 엄밀한 강제는 CoachResultDto가 맡는다.
// substitute.replacement의 세트엔 id가 없다(LLM은 못 만든다) — 서버가 주입한 뒤 최종 검증한다.
const LlmReplacement = z.object({
  name: z.string(),
  muscleGroups: z.array(z.string()),
  note: z.string().optional(),
  sets: z.array(z.object({ targetWeightKg: z.number(), targetReps: z.number() })),
});
const LlmCoachChange = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('substitute'),
    targetExerciseName: z.string(),
    replacement: LlmReplacement,
    reason: z.string(),
  }),
  z.object({
    kind: z.literal('adjust_load'),
    targetExerciseName: z.string(),
    weightFactor: z.number(),
    repsDelta: z.number().optional(),
    dropSets: z.number().optional(),
    reason: z.string(),
  }),
  z.object({ kind: z.literal('rest'), durationSec: z.number(), reason: z.string() }),
  z.object({ kind: z.literal('end_session'), reason: z.string() }),
]);
const LlmCoachStruct = z.object({ change: LlmCoachChange.nullable() });

type LlmChange = z.infer<typeof LlmCoachChange>;

const newId = (): string => crypto.randomUUID();

export function createCoachService(llm: LlmClient): CoachService {
  return {
    reply: async (session, history, onDelta) => {
      const { message, data } = await llm.generate(
        {
          system: buildSystemPrompt(session),
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          schema: LlmCoachStruct,
        },
        onDelta,
      );

      // substitute의 replacement 세트에 id를 주입해 계약(PlannedSet) 형태를 맞춘 뒤 최종 검증한다.
      const change = data.change === null ? null : withSetIds(data.change);

      return CoachResultDto.parse({ message, change });
    },
  };
}

function withSetIds(change: LlmChange): unknown {
  if (change.kind !== 'substitute') {
    return change;
  }

  return {
    ...change,
    replacement: {
      ...change.replacement,
      sets: change.replacement.sets.map((s) => ({ ...s, id: newId() })),
    },
  };
}

// 운동 철학(현장 대응 규칙)을 코치 행동 규칙으로 압축 + 현재 세션 상태를 싣고 출력 형식을 명세한다.
function buildSystemPrompt(session: LiveSessionView): string {
  return `너는 운동 *중*인 사용자를 돕는 코치다. 현장 변수(자리/장비 없음, 컨디션 난조, 통증 등)에 과학적 근거로 대응한다.

대상: ${session.routineDayLabel}
${formatSession(session.exercises)}

대응 규칙(과학적 근거):
- 자리/장비 없음 → 동일 근육군의 대체 운동으로 "교체"(substitute). 원본과 같은 근육군을 우선한다.
- 컨디션 난조 → "부하 하향"(adjust_load). 무게는 weightFactor(0.5~1, 하향만)로, 횟수는 repsDelta(0 이하)로, 남은 세트는 dropSets로 줄인다. 상향(↑)은 금지(다음 계획에서만).
- 어지러움/통증 → "휴식"(rest, 초 단위) 권유, 심하면 "조기 종료"(end_session).
- "오늘 너무 쉽다"는 즉석 신호로는 증량하지 않는다 — 오늘은 계획대로 수행하고 다음 계획에서 반영하라고 안내한다.
- 이미 수행한(완료된) 세트는 바꿀 수 없다. 변경은 남은 세트에만 적용된다.

응답 형식(반드시 이 순서):
1) 먼저 사용자에게 보여줄 한국어 메시지를 자연어로 쓴다.
2) 그 다음 줄에 정확히 "${STRUCT_DELIMITER}" 한 줄을 쓴다.
3) 그 아래에 아래 구조 JSON만 쓴다(message 필드는 넣지 않는다, 코드블록 없이 JSON 그 자체).

{"change": <아래 중 하나 또는 null(대화만 하고 변경이 없으면 null)>}

- 교체: {"kind":"substitute","targetExerciseName":"<원본 운동명>","replacement":{"name":"<대체 운동명>","muscleGroups":[<"chest"|"back"|"shoulders"|"legs"|"glutes"|"core"|"biceps"|"triceps" 중 하나 이상>],"sets":[{"targetWeightKg":<0 이상 숫자>,"targetReps":<양의 정수>}]},"reason":"<사유>"}
- 부하 하향: {"kind":"adjust_load","targetExerciseName":"<운동명>","weightFactor":<0.5~1>,"repsDelta":<0 이하 정수, 선택>,"dropSets":<0 이상 정수, 선택>,"reason":"<사유>"}
- 휴식: {"kind":"rest","durationSec":<양의 정수>,"reason":"<사유>"}
- 종료: {"kind":"end_session","reason":"<사유>"}`;
}

function formatSession(exercises: PlanExerciseRecord[]): string {
  if (exercises.length === 0) {
    return '현재 계획에 운동이 없다.';
  }

  const lines = exercises.map((ex) => {
    const sets = ex.sets
      .map((s) => {
        const target = `${s.targetWeightKg}kg×${s.targetReps}`;

        return s.actual === undefined
          ? `${target}(예정)`
          : `${target}→완료(${s.actual.weightKg}kg×${s.actual.reps}, RIR ${s.actual.rir})`;
      })
      .join(', ');

    return `- ${ex.name}[${ex.muscleGroups.join('/')}]: ${sets}`;
  });

  return `현재 진행 상황:\n${lines.join('\n')}`;
}
