import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import type { JSX } from 'react';
import type { Routine } from '../../routines/repository';
import { useRoutines } from '../../routines/use-routines';

export const Route = createFileRoute('/routines')({
  // 보호 라우트 — 진입 단계에서 인증을 확인해, 미로그인이면 콘텐츠를 렌더하기 전에 홈으로 돌린다.
  beforeLoad: async ({ context }) => {
    const user = await context.authService.me();
    if (user === null) {
      throw redirect({ to: '/' });
    }
  },
  component: RoutinesScreen,
});

function RoutinesScreen(): JSX.Element {
  const state = useRoutines();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">내 루틴</h1>
        <Link
          to="/"
          className="text-sm text-neutral-500"
        >
          홈
        </Link>
      </header>

      {state.status === 'loading' && <p className="text-neutral-500">불러오는 중…</p>}
      {state.status === 'error' && <p className="text-red-600">루틴을 불러오지 못했어요.</p>}
      {state.status === 'empty' && <EmptyRoutines />}
      {state.status === 'loaded' && (
        <ul className="flex flex-col gap-3">
          {state.routines.map((routine) => (
            <li key={routine.id}>
              <RoutineCard routine={routine} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function EmptyRoutines(): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-neutral-500">아직 루틴이 없어요.</p>
      {/* 루틴 생성(S2) 동선은 후속 작업 — 지금은 자리만 잡는다. */}
      <button
        type="button"
        disabled
        className="rounded-lg bg-neutral-200 px-4 py-2 text-neutral-400"
      >
        루틴 만들기 (준비 중)
      </button>
    </div>
  );
}

function RoutineCard({ routine }: { routine: Routine }): JSX.Element {
  const exerciseCount = routine.days.reduce((sum, day) => sum + day.exercises.length, 0);

  return (
    <article className="rounded-xl border border-neutral-200 p-4">
      <h2 className="font-semibold text-neutral-900">{routine.name}</h2>
      <p className="mt-1 text-sm text-neutral-500">
        {routine.splitType} · 주 {routine.daysPerWeek}회 · 운동 {exerciseCount}개
      </p>
    </article>
  );
}
