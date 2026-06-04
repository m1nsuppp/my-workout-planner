import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { JSX, SyntheticEvent } from 'react';
import type { PlanDraft } from '../../plans/repository';
import { useNextDay } from '../../plans/use-next-day';
import { usePlanChat } from '../../plans/use-plan-chat';

export const Route = createFileRoute('/plans_/new')({
  // 어느 루틴으로 계획을 만들지 search param으로 받는다(S3 "계획 만들기"가 채운다).
  validateSearch: (search: Record<string, unknown>): { routineId: string } => {
    const { routineId } = search;
    if (typeof routineId !== 'string' || routineId === '') {
      throw new Error('계획을 만들 루틴을 지정해야 합니다.');
    }

    return { routineId };
  },
  // 보호 라우트 — 미로그인이면 콘텐츠 렌더 전에 홈으로 돌린다.
  beforeLoad: async ({ context }) => {
    const user = await context.authService.me();
    if (user === null) {
      throw redirect({ to: '/' });
    }
  },
  component: PlanChatRoute,
});

// 다음 차례 Day를 먼저 확정한 뒤에야 대화를 시작할 수 있으므로, 로딩/에러를 여기서 가른다.
function PlanChatRoute(): JSX.Element {
  const { routineId } = Route.useSearch();
  const nextDay = useNextDay(routineId);

  if (nextDay.status === 'loading') {
    return (
      <main className="flex flex-1 flex-col p-6">
        <p className="text-neutral-500">다음 운동을 준비하는 중…</p>
      </main>
    );
  }
  if (nextDay.status === 'error') {
    return (
      <main className="flex flex-1 flex-col p-6">
        <p className="text-red-600">다음 운동 정보를 불러오지 못했어요.</p>
      </main>
    );
  }

  return <PlanChatScreen routineId={routineId} routineDayLabel={nextDay.nextDay.label} />;
}

// ISODate "YYYY-MM-DD" — ISO 문자열의 날짜 부분(앞 10자).
const ISO_DATE_END = 10;
function todayISODate(): string {
  return new Date().toISOString().slice(0, ISO_DATE_END);
}

function PlanChatScreen({
  routineId,
  routineDayLabel,
}: {
  routineId: string;
  routineDayLabel: string;
}): JSX.Element {
  const [date] = useState(todayISODate);
  const chat = usePlanChat({ routineId, routineDayLabel, date });
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const text = input.trim();
    if (text === '' || chat.status === 'sending') {
      return;
    }
    chat.send(text);
    setInput('');
  };

  const confirm = (): void => {
    // 확정 후 그 계획 상세(S6)로 이동한다. 실패는 chat.status로 화면에 노출된다.
    void chat.confirm().then(
      (plan) => {
        void navigate({ to: '/plans/$id', params: { id: plan.id } });
      },
      () => undefined,
    );
  };

  return (
    <main className="flex flex-1 flex-col p-6">
      <header className="pb-4">
        <h1 className="text-xl font-bold text-neutral-900">계획 만들기</h1>
        <p className="pt-1 text-sm text-neutral-500">
          {routineDayLabel} · {date}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {chat.messages.length === 0 && (
          <p className="text-neutral-500">
            오늘 컨디션이나 장비 상황을 알려주면, 직전 기록을 토대로 코치가 무게·횟수를 제안해요.
          </p>
        )}
        {chat.messages.map((message, i) => (
          <MessageBubble
            key={i}
            role={message.role}
            content={message.content}
          />
        ))}
        {chat.streaming !== '' && (
          <MessageBubble
            role="assistant"
            content={chat.streaming}
          />
        )}
        {chat.status === 'sending' && chat.streaming === '' && (
          <p className="text-sm text-neutral-400">코치가 작성 중…</p>
        )}
        {chat.status === 'chatError' && (
          <p className="text-sm text-red-600">응답을 받지 못했어요. 다시 보내주세요.</p>
        )}
        {chat.status === 'createError' && (
          <p className="text-sm text-red-600">계획 저장에 실패했어요. 다시 시도해 주세요.</p>
        )}
        {chat.proposal !== null && (
          <PlanPreview
            plan={chat.proposal}
            onConfirm={confirm}
            creating={chat.status === 'creating'}
          />
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
        />
        <button
          type="submit"
          disabled={chat.status === 'sending'}
          className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          보내기
        </button>
      </form>
    </main>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }): JSX.Element {
  const mine = role === 'user';

  return (
    <div className={mine ? 'self-end' : 'self-start'}>
      <p
        className={`max-w-[280px] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
          mine ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'
        }`}
      >
        {content}
      </p>
    </div>
  );
}

function PlanPreview({
  plan,
  onConfirm,
  creating,
}: {
  plan: PlanDraft;
  onConfirm: () => void;
  creating: boolean;
}): JSX.Element {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="font-bold text-neutral-900">{plan.routineDayLabel}</h2>
      {plan.overloadNote !== undefined && (
        <p className="pt-1 text-xs text-neutral-500">{plan.overloadNote}</p>
      )}
      <ul className="flex flex-col gap-2 pt-3">
        {plan.exercises.map((ex, i) => (
          <li key={i}>
            <p className="text-sm font-medium text-neutral-800">{ex.name}</p>
            <ul className="pl-3 text-sm text-neutral-600">
              {ex.sets.map((set, j) => (
                <li key={j}>
                  {set.targetWeightKg}kg × {set.targetReps}회
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onConfirm}
        disabled={creating}
        className="mt-4 w-full rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {creating ? '저장 중…' : '이 계획으로 확정'}
      </button>
    </section>
  );
}
