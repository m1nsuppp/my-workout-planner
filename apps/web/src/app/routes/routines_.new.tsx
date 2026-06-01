import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { JSX, SyntheticEvent } from 'react';
import type { RoutineDraft } from '../../routines/repository';
import { useRoutineChat } from '../../routines/use-routine-chat';

export const Route = createFileRoute('/routines_/new')({
  // 보호 라우트 — 미로그인이면 콘텐츠 렌더 전에 홈으로 돌린다(routines 목록과 동일 정책).
  beforeLoad: async ({ context }) => {
    const user = await context.authService.me();
    if (user === null) {
      throw redirect({ to: '/' });
    }
  },
  component: RoutineChatScreen,
});

function RoutineChatScreen(): JSX.Element {
  const chat = useRoutineChat();
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
    void chat.confirm().then(
      () => {
        void navigate({ to: '/routines' });
      },
      () => undefined, // 실패는 chat.status='error'로 이미 화면에 노출된다.
    );
  };

  return (
    <main className="flex flex-1 flex-col p-6">
      <header className="flex items-center justify-between pb-4">
        <h1 className="text-xl font-bold text-neutral-900">루틴 만들기</h1>
        <Link
          to="/routines"
          className="text-sm text-neutral-500"
        >
          내 루틴
        </Link>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {chat.messages.length === 0 && (
          <p className="text-neutral-500">
            어떤 운동 루틴을 원하세요? 목표·주당 빈도·분할 방식을 알려주면 코치가 루틴을 제안해요.
          </p>
        )}
        {chat.messages.map((message, i) => (
          <MessageBubble
            key={i}
            role={message.role}
            content={message.content}
          />
        ))}
        {chat.status === 'sending' && <p className="text-sm text-neutral-400">코치가 작성 중…</p>}
        {chat.status === 'error' && (
          <p className="text-sm text-red-600">응답을 받지 못했어요. 다시 시도해 주세요.</p>
        )}
        {chat.proposal !== null && (
          <RoutinePreview
            routine={chat.proposal}
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

function RoutinePreview({
  routine,
  onConfirm,
  creating,
}: {
  routine: RoutineDraft;
  onConfirm: () => void;
  creating: boolean;
}): JSX.Element {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="font-bold text-neutral-900">{routine.name}</h2>
      <p className="pt-1 text-xs text-neutral-500">
        {routine.splitType} · 주 {routine.daysPerWeek}회 · {routine.goal}
      </p>
      <ul className="flex flex-col gap-2 pt-3">
        {routine.days.map((day, i) => (
          <li key={i}>
            <p className="text-sm font-medium text-neutral-800">{day.label}</p>
            <ul className="pl-3 text-sm text-neutral-600">
              {day.exercises.map((ex, j) => (
                <li key={j}>
                  {ex.name} — {ex.targetSets}세트 × {ex.targetRepRange[0]}–{ex.targetRepRange[1]}회
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
        {creating ? '저장 중…' : '이 루틴으로 확정'}
      </button>
    </section>
  );
}
