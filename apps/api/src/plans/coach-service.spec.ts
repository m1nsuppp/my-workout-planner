import { describe, expect, it } from 'vitest';
import { createFakeLlmClient } from '../llm/fake-client';
import { createCoachService, type LiveSessionView } from './coach-service';

const session: LiveSessionView = {
  routineDayLabel: '상체 A',
  exercises: [
    {
      name: '벤치프레스',
      muscleGroups: ['chest'],
      sets: [
        { id: 's1', targetWeightKg: 50, targetReps: 8 },
        { id: 's2', targetWeightKg: 50, targetReps: 8 },
      ],
    },
  ],
};

describe('createCoachService', () => {
  it('변경 없는 대화(change null)를 그대로 돌려준다', async () => {
    const service = createCoachService(
      createFakeLlmClient(() => ({ message: '좀 더 버텨봐요!', change: null })),
    );

    const result = await service.reply(session, [{ role: 'user', content: '힘들어요' }]);

    expect(result).toEqual({ message: '좀 더 버텨봐요!', change: null });
  });

  it('adjust_load 변경안을 돌려준다', async () => {
    const service = createCoachService(
      createFakeLlmClient(() => ({
        message: '오늘은 무게를 낮춰요.',
        change: {
          kind: 'adjust_load',
          targetExerciseName: '벤치프레스',
          weightFactor: 0.8,
          reason: '컨디션 난조',
        },
      })),
    );

    const result = await service.reply(session, [{ role: 'user', content: '어지러워요' }]);

    expect(result.change).toMatchObject({ kind: 'adjust_load', weightFactor: 0.8 });
  });

  it('substitute의 replacement 세트에 서버가 id를 주입한다(LLM은 못 만든다)', async () => {
    const service = createCoachService(
      createFakeLlmClient(() => ({
        message: '풀업으로 바꿔요.',
        change: {
          kind: 'substitute',
          targetExerciseName: '벤치프레스',
          replacement: {
            name: '어시스트 풀업',
            muscleGroups: ['back'],
            sets: [{ targetWeightKg: 0, targetReps: 10 }], // id 없음
          },
          reason: '자리 없음',
        },
      })),
    );

    const result = await service.reply(session, [{ role: 'user', content: '벤치 자리 없어요' }]);

    expect(result.change?.kind).toBe('substitute');
    if (result.change?.kind === 'substitute') {
      expect(result.change.replacement.sets[0].id).toBeTruthy();
    }
  });

  it('상향(weightFactor>1)은 계약 검증에서 거부된다', async () => {
    const service = createCoachService(
      createFakeLlmClient(() => ({
        message: '증량!',
        change: {
          kind: 'adjust_load',
          targetExerciseName: '벤치프레스',
          weightFactor: 1.2, // 상향 — CoachResultDto가 거부
          reason: '쉬워서',
        },
      })),
    );

    await expect(service.reply(session, [{ role: 'user', content: 'go' }])).rejects.toThrow();
  });

  it('현재 세션 상태를 시스템 프롬프트에 싣는다', async () => {
    let captured = '';
    const service = createCoachService(
      createFakeLlmClient((input) => {
        captured = input.system;

        return { message: 'ok', change: null };
      }),
    );

    await service.reply(session, [{ role: 'user', content: 'go' }]);

    expect(captured).toContain('벤치프레스');
    expect(captured).toContain('상체 A');
  });
});
