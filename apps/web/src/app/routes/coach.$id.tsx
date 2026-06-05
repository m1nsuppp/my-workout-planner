import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { JSX } from 'react';
import { usePlanService } from '../contexts/plan-service-context';
import { planQueries } from '../../plans/queries';
import type { CoachChange } from '../../plans/repository';
import { useCoach } from '../../plans/use-coach';

export const Route = createFileRoute('/coach/$id')({
  // 보호 라우트 — 미로그인이면 콘텐츠 렌더 전에 홈으로 돌린다.
  beforeLoad: async ({ context }) => {
    const user = await context.authService.me();
    if (user === null) {
      throw redirect({ to: '/' });
    }
  },
  component: CoachScreen,
});

function CoachScreen(): JSX.Element {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const service = usePlanService();
  const queryClient = useQueryClient();
  const coach = useCoach(id);
  const [text, setText] = useState('');

  const backToWorkout = (): void => {
    void navigate({ to: '/workout/$id', params: { id } });
  };

  const submit = (): void => {
    if (text === '' || coach.status === 'sending') {
      return;
    }
    coach.send(text);
    setText('');
  };

  // applying(substitute/adjust_load) 변경안 적용 → 변경 반영된 세션으로 복귀.
  const applyChange = (): void => {
    void coach.apply().then(backToWorkout, () => undefined);
  };

  // advisory end_session → 상태 변경은 status 엔드포인트로(책임 분리). 종료 후 계획 상세로.
  const endSession = useMutation({
    mutationFn: async () => await service.updateStatus(id, 'completed'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: planQueries.all });
      void navigate({ to: '/plans/$id', params: { id } });
    },
  });

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={backToWorkout}
          className="text-sm text-neutral-500"
        >
          ← 운동으로
        </button>
        <span className="text-sm font-medium text-neutral-900">코치</span>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {coach.messages.length === 0 && (
          <p className="text-neutral-500">
            자리·장비 문제나 컨디션을 말해주면, 코치가 교체·부하 조정·휴식을 제안해요.
          </p>
        )}
        {coach.messages.map((message, i) => (
          <MessageBubble
            key={i}
            role={message.role}
            content={message.content}
          />
        ))}
        {coach.streaming !== '' && (
          <MessageBubble
            role="assistant"
            content={coach.streaming}
          />
        )}
        {coach.status === 'sending' && coach.streaming === '' && (
          <p className="text-sm text-neutral-400">코치가 작성 중…</p>
        )}
        {coach.status === 'chatError' && (
          <p className="text-sm text-red-600">응답을 받지 못했어요. 다시 보내주세요.</p>
        )}
        {coach.status === 'applyError' && (
          <p className="text-sm text-red-600">변경 적용에 실패했어요. 다시 시도해 주세요.</p>
        )}
        {coach.change !== null && (
          <ChangeCard
            change={coach.change}
            applying={coach.status === 'applying'}
            ending={endSession.isPending}
            onApply={applyChange}
            onEnd={() => endSession.mutate()}
          />
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submit();
            }
          }}
          placeholder="예: 벤치 자리가 없어요"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={submit}
          disabled={coach.status === 'sending'}
          className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          보내기
        </button>
      </div>
    </main>
  );
}

// 코치 변경안 미리보기 + 행동 버튼. applying은 적용, advisory(rest/end_session)는 클라가 처리.
function ChangeCard({
  change,
  applying,
  ending,
  onApply,
  onEnd,
}: {
  change: CoachChange;
  applying: boolean;
  ending: boolean;
  onApply: () => void;
  onEnd: () => void;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-300 bg-neutral-50 p-4">
      <p className="text-sm text-neutral-900">{describeChange(change)}</p>
      <p className="mt-1 text-xs text-neutral-500">{change.reason}</p>

      {(change.kind === 'substitute' || change.kind === 'adjust_load') && (
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {applying ? '적용 중…' : '적용하기'}
        </button>
      )}
      {change.kind === 'end_session' && (
        <button
          type="button"
          onClick={onEnd}
          disabled={ending}
          className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {ending ? '종료 중…' : '운동 종료'}
        </button>
      )}
    </div>
  );
}

const PERCENT = 100;

function describeChange(change: CoachChange): string {
  switch (change.kind) {
    case 'substitute':
      return `${change.targetExerciseName} → ${change.replacement.name}(으)로 교체`;
    case 'adjust_load': {
      const pct = Math.round(change.weightFactor * PERCENT);

      return `${change.targetExerciseName} 부하 하향(무게 ${pct}%)`;
    }
    case 'rest':
      return `${change.durationSec}초 휴식 권유`;
    case 'end_session':
      return '오늘은 여기서 마무리할까요?';
  }
}

function MessageBubble({ role, content }: { role: string; content: string }): JSX.Element {
  const mine = role === 'user';

  return (
    <div className={mine ? 'self-end' : 'self-start'}>
      <div
        className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
          mine ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'
        }`}
      >
        {content}
      </div>
    </div>
  );
}
