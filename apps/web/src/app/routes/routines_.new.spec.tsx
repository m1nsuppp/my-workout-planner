import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreateRoutineResponseDto } from '@workout/contracts';
import type { Routine, RoutineDraft, RoutineProposal } from '../../routines/repository';
import { fakeRoutineService, renderRoute } from '../test-support/render-route';

const draft: RoutineDraft = {
  name: '상하체 분할',
  goal: 'hypertrophy',
  splitType: 'upper_lower',
  daysPerWeek: 4,
  days: [{ label: '상체 A', exercises: [] }],
};

const createdRoutine: Routine = (() => {
  const envelope = CreateRoutineResponseDto.parse({
    ok: true,
    data: { ...draft, id: 'r1', createdAt: '2026-05-01T00:00:00.000Z' },
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
})();

const asking: RoutineProposal = { phase: 'asking', message: '운동 경력은요?' };
const proposing: RoutineProposal = {
  phase: 'proposing',
  message: '이 루틴 어때요?',
  routine: draft,
};

describe('루틴 만들기(/routines/new)', () => {
  it('초기에는 안내 문구를 보여준다', async () => {
    await renderRoute('/routines/new');

    expect(await screen.findByText(/어떤 운동 루틴을 원하세요/)).toBeDefined();
  });

  it('메시지를 보내면 코치 응답이 대화에 쌓인다', async () => {
    await renderRoute('/routines/new', {
      routineService: fakeRoutineService({ chat: async () => asking }),
    });

    const input = await screen.findByPlaceholderText('메시지를 입력하세요');
    fireEvent.change(input, { target: { value: '4분할 짜줘' } });
    fireEvent.click(screen.getByText('보내기'));

    expect(await screen.findByText('운동 경력은요?')).toBeDefined();
    expect(screen.getByText('4분할 짜줘')).toBeDefined();
  });

  it('제안을 확정하면 루틴 목록으로 이동한다', async () => {
    const { router } = await renderRoute('/routines/new', {
      routineService: fakeRoutineService({
        chat: async () => proposing,
        create: async () => createdRoutine,
        list: async () => [createdRoutine],
      }),
    });

    const input = await screen.findByPlaceholderText('메시지를 입력하세요');
    fireEvent.change(input, { target: { value: '확정할래' } });
    fireEvent.click(screen.getByText('보내기'));

    fireEvent.click(await screen.findByText('이 루틴으로 확정'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/routines'));
  });
});
