import { describe, expect, it } from 'vitest';
import type { LlmMessage } from '../llm/client';
import { createFakeLlmClient } from '../llm/fake-client';
import { createRoutineChatService } from './chat-service';

describe('createRoutineChatService', () => {
  it('LLM의 asking 응답을 RoutineProposal로 돌려준다', async () => {
    const service = createRoutineChatService(
      createFakeLlmClient(() => ({ phase: 'asking', message: '운동 경력은요?' })),
    );

    const result = await service.reply([{ role: 'user', content: '루틴 짜줘' }]);

    expect(result).toEqual({ phase: 'asking', message: '운동 경력은요?' });
  });

  it('LLM의 proposing 응답(루틴 포함)을 그대로 돌려준다', async () => {
    const routine = {
      name: '상하체 분할',
      goal: 'hypertrophy',
      splitType: 'upper_lower',
      daysPerWeek: 4,
      days: [
        {
          label: '상체 A',
          exercises: [
            { name: '벤치프레스', muscleGroups: ['chest'], targetSets: 3, targetRepRange: [8, 12] },
          ],
        },
      ],
    };
    const service = createRoutineChatService(
      createFakeLlmClient(() => ({ phase: 'proposing', message: '이거 어때요?', routine })),
    );

    const result = await service.reply([{ role: 'user', content: '확정' }]);

    expect(result).toEqual({ phase: 'proposing', message: '이거 어때요?', routine });
  });

  it('모델이 rep 범위가 역전된(min>max) 루틴을 내면 거부한다', async () => {
    const invalid = {
      phase: 'proposing',
      message: '제안',
      routine: {
        name: '상하체 분할',
        goal: 'hypertrophy',
        splitType: 'upper_lower',
        daysPerWeek: 4,
        days: [
          {
            label: '상체 A',
            exercises: [
              { name: '벤치프레스', muscleGroups: ['chest'], targetSets: 3, targetRepRange: [12, 8] },
            ],
          },
        ],
      },
    };
    const service = createRoutineChatService(createFakeLlmClient(() => invalid));

    await expect(service.reply([{ role: 'user', content: 'go' }])).rejects.toThrow();
  });

  it('대화 기록을 LLM 메시지로 전달한다', async () => {
    let captured: LlmMessage[] = [];
    const service = createRoutineChatService(
      createFakeLlmClient((input) => {
        captured = input.messages;
        return { phase: 'asking', message: 'ok' };
      }),
    );

    await service.reply([
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
    ]);

    expect(captured).toEqual([
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
    ]);
  });
});
