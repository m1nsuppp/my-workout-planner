import { describe, expect, it } from 'vitest';
import type { LlmMessage } from '../llm/client';
import { createFakeLlmClient } from '../llm/fake-client';
import { createPlanChatService, type PlanChatContext } from './chat-service';

const context: PlanChatContext = {
  routineId: 'r1',
  routineDayLabel: '상체 A',
  date: '2026-05-25',
  overloads: [],
};

describe('createPlanChatService', () => {
  it('LLM의 asking 응답을 그대로 돌려준다', async () => {
    const service = createPlanChatService(
      createFakeLlmClient(() => ({ phase: 'asking', message: '오늘 컨디션 어때요?' })),
    );

    const result = await service.reply(context, [{ role: 'user', content: '계획 짜줘' }]);

    expect(result).toEqual({ phase: 'asking', message: '오늘 컨디션 어때요?' });
  });

  it('proposing이면 식별 필드(routineId/date/routineDayLabel)를 서버가 주입한다', async () => {
    // LLM은 운동 내용만 낸다 — 식별 필드는 응답에 없다.
    const service = createPlanChatService(
      createFakeLlmClient(() => ({
        phase: 'proposing',
        message: '이 계획 어때요?',
        planDraft: {
          exercises: [
            { name: '벤치프레스', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 8 }] },
          ],
          overloadNote: '첫 수행이라 보수적으로 시작',
        },
      })),
    );

    const result = await service.reply(context, [{ role: 'user', content: '확정' }]);

    expect(result.phase).toBe('proposing');
    if (result.phase === 'proposing') {
      expect(result.planDraft.routineId).toBe('r1');
      expect(result.planDraft.date).toBe('2026-05-25');
      expect(result.planDraft.routineDayLabel).toBe('상체 A');
      expect(result.planDraft.exercises[0].name).toBe('벤치프레스');
      expect(result.planDraft.overloadNote).toBe('첫 수행이라 보수적으로 시작');
    }
  });

  it('모델이 targetReps에 0(양수 아님)을 내면 거부한다(스키마 강제)', async () => {
    const service = createPlanChatService(
      createFakeLlmClient(() => ({
        phase: 'proposing',
        message: '제안',
        planDraft: {
          exercises: [
            { name: '벤치프레스', muscleGroups: ['chest'], sets: [{ targetWeightKg: 50, targetReps: 0 }] },
          ],
        },
      })),
    );

    await expect(service.reply(context, [{ role: 'user', content: 'go' }])).rejects.toThrow();
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
        return { phase: 'asking', message: 'ok' };
      }),
    );

    await service.reply(withOverload, [{ role: 'user', content: 'go' }]);

    expect(captured).toContain('벤치프레스');
    expect(captured).toContain('RIR 3');
  });

  it('대화 기록을 LLM 메시지로 전달한다', async () => {
    let captured: LlmMessage[] = [];
    const service = createPlanChatService(
      createFakeLlmClient((input) => {
        captured = input.messages;
        return { phase: 'asking', message: 'ok' };
      }),
    );

    await service.reply(context, [
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
    ]);

    expect(captured).toEqual([
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
    ]);
  });
});
