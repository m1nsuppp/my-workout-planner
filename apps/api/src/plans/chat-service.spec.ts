import { CreatePlanRequestDto } from '@workout/contracts';
import { describe, expect, it } from 'vitest';
import type { LlmMessage } from '../llm/client';
import { createFakeLlmClient } from '../llm/fake-client';
import { createPlanChatService, type PlanChatContext } from './chat-service';

const context: PlanChatContext = {
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  template: [],
  overloads: [],
};

// 사용자가 편집 중인 현재 카드(클라가 보내는 draft). 식별 필드는 brand 타입이라 계약 스키마로 parse해 만든다.
const draft = CreatePlanRequestDto.parse({
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  exercises: [
    { name: '벤치프레스', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
  ],
});

// 프롬프트 내용만 보려는 테스트가 쓰는 유효한 응답.
const okReply = {
  message: 'ok',
  planDraft: {
    exercises: [
      {
        name: '벤치프레스',
        muscleGroups: ['chest'],
        sets: [{ targetWeightKg: 50, targetReps: 8 }],
      },
    ],
  },
};

describe('createPlanChatService', () => {
  it('항상 message + planDraft를 돌려주고 식별 필드(routineId/date/routineDayLabel)를 서버가 주입한다', async () => {
    // LLM은 운동 내용만 낸다 — 식별 필드는 응답에 없다.
    const service = createPlanChatService(
      createFakeLlmClient(() => ({
        message: '이 계획 어때요?',
        planDraft: {
          exercises: [
            {
              name: '벤치프레스',
              muscleGroups: ['chest'],
              sets: [{ targetWeightKg: 52.5, targetReps: 8 }],
            },
          ],
          overloadNote: '지난 벤치 RIR 3 → 2.5kg 증량',
        },
      })),
    );

    const result = await service.reply(context, draft, [{ role: 'user', content: '확정' }]);

    expect(result.message).toBe('이 계획 어때요?');
    expect(result.planDraft.routineId).toBe('r1');
    expect(result.planDraft.date).toBe('2026-05-25');
    expect(result.planDraft.routineDayLabel).toBe('상체 A');
    expect(result.planDraft.exercises[0].name).toBe('벤치프레스');
    expect(result.planDraft.overloadNote).toBe('지난 벤치 RIR 3 → 2.5kg 증량');
  });

  it('되물을 때도 planDraft를 채워 돌려준다(빈 제안 없음)', async () => {
    const service = createPlanChatService(
      createFakeLlmClient(() => ({
        message: '오늘 컨디션 어때요?',
        planDraft: {
          exercises: [
            {
              name: '벤치프레스',
              muscleGroups: ['chest'],
              sets: [{ targetWeightKg: 50, targetReps: 8 }],
            },
          ],
        },
      })),
    );

    const result = await service.reply(context, draft, [{ role: 'user', content: '시작' }]);

    expect(result.message).toBe('오늘 컨디션 어때요?');
    expect(result.planDraft.exercises).toHaveLength(1);
  });

  it('모델이 targetReps에 0(양수 아님)을 내면 거부한다(스키마 강제)', async () => {
    const service = createPlanChatService(
      createFakeLlmClient(() => ({
        message: '제안',
        planDraft: {
          exercises: [
            {
              name: '벤치프레스',
              muscleGroups: ['chest'],
              sets: [{ targetWeightKg: 50, targetReps: 0 }],
            },
          ],
        },
      })),
    );

    await expect(
      service.reply(context, draft, [{ role: 'user', content: 'go' }]),
    ).rejects.toThrow();
  });

  it('Day 운동 템플릿을 시스템 프롬프트에 싣는다(grounding)', async () => {
    let captured = '';
    const withTemplate: PlanChatContext = {
      ...context,
      template: [
        { name: '바벨 스쿼트', muscleGroups: ['legs'], targetSets: 4, targetRepRange: [8, 10] },
      ],
    };
    const service = createPlanChatService(
      createFakeLlmClient((input) => {
        captured = input.system;
        return okReply;
      }),
    );

    await service.reply(withTemplate, draft, [{ role: 'user', content: 'go' }]);

    expect(captured).toContain('바벨 스쿼트');
    expect(captured).toContain('4세트');
  });

  it('현재 카드(draft)를 시스템 프롬프트에 싣는다', async () => {
    let captured = '';
    const service = createPlanChatService(
      createFakeLlmClient((input) => {
        captured = input.system;
        return okReply;
      }),
    );

    await service.reply(context, draft, [{ role: 'user', content: 'go' }]);

    expect(captured).toContain('현재 카드');
    expect(captured).toContain('벤치프레스');
  });

  it('과부하 기록을 시스템 프롬프트에 싣는다', async () => {
    let captured = '';
    const withOverload: PlanChatContext = {
      ...context,
      overloads: [
        {
          exerciseName: '벤치프레스',
          sets: [{ weightKg: 50, reps: 8, rir: 3, completedAt: '2026-05-20T10:00:00.000Z' }],
        },
      ],
    };
    const service = createPlanChatService(
      createFakeLlmClient((input) => {
        captured = input.system;
        return okReply;
      }),
    );

    await service.reply(withOverload, draft, [{ role: 'user', content: 'go' }]);

    expect(captured).toContain('RIR 3');
  });

  it('대화 기록을 LLM 메시지로 전달한다', async () => {
    let captured: LlmMessage[] = [];
    const service = createPlanChatService(
      createFakeLlmClient((input) => {
        captured = input.messages;
        return okReply;
      }),
    );

    await service.reply(context, draft, [
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
    ]);

    expect(captured).toEqual([
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
    ]);
  });
});
