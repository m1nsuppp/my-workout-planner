import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import type { JSX } from 'react';
import type { Routine } from '../../routines/repository';
import { useRoutine } from '../../routines/use-routine';

export const Route = createFileRoute('/routines_/$id')({
  // 보호 라우트 — 미로그인이면 콘텐츠 렌더 전에 홈으로 돌린다(루틴 목록·생성과 동일 정책).
  beforeLoad: async ({ context }) => {
    const user = await context.authService.me();
    if (user === null) {
      throw redirect({ to: '/' });
    }
  },
  component: RoutineDetailScreen,
});

function RoutineDetailScreen(): JSX.Element {
  const { id } = Route.useParams();
  const state = useRoutine(id);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <Link
          to="/routines"
          className="text-sm text-neutral-500"
        >
          ← 내 루틴
        </Link>
      </header>

      {state.status === 'loading' && <p className="text-neutral-500">불러오는 중…</p>}
      {state.status === 'notfound' && <p className="text-neutral-500">루틴을 찾을 수 없어요.</p>}
      {state.status === 'error' && <p className="text-red-600">루틴을 불러오지 못했어요.</p>}
      {state.status === 'loaded' && <RoutineDetail routine={state.routine} />}
    </main>
  );
}

function RoutineDetail({ routine }: { routine: Routine }): JSX.Element {
  return (
    <article className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">{routine.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {routine.splitType} · 주 {routine.daysPerWeek}회 · {routine.goal}
        </p>
      </div>

      <Link
        to="/plans/new"
        search={{ routineId: routine.id }}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-center font-medium text-white"
      >
        이 루틴으로 계획 만들기
      </Link>

      <ul className="flex flex-col gap-4">
        {routine.days.map((day, i) => (
          <li
            key={i}
            className="rounded-xl border border-neutral-200 p-4"
          >
            <h2 className="font-semibold text-neutral-900">{day.label}</h2>
            {day.exercises.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-400">운동 없음</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {day.exercises.map((ex, j) => (
                  <li key={j}>
                    <p className="text-sm text-neutral-800">
                      {ex.name} — {ex.targetSets}세트 × {ex.targetRepRange[0]}–{ex.targetRepRange[1]}
                      회
                    </p>
                    <p className="text-xs text-neutral-400">{ex.muscleGroups.join(', ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}
