import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { JSX } from 'react';
import { usePlanService } from '../contexts/plan-service-context';
import type { Plan } from '../../plans/repository';
import { usePlan } from '../../plans/use-plan';

export const Route = createFileRoute('/plans_/$id')({
  // 보호 라우트 — 미로그인이면 콘텐츠 렌더 전에 홈으로 돌린다.
  beforeLoad: async ({ context }) => {
    const user = await context.authService.me();
    if (user === null) {
      throw redirect({ to: '/' });
    }
  },
  component: PlanDetailScreen,
});

function PlanDetailScreen(): JSX.Element {
  const { id } = Route.useParams();
  const state = usePlan(id);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="text-sm text-neutral-500"
        >
          ← 홈
        </Link>
      </header>

      {state.status === 'loading' && <p className="text-neutral-500">불러오는 중…</p>}
      {state.status === 'notfound' && <p className="text-neutral-500">계획을 찾을 수 없어요.</p>}
      {state.status === 'error' && <p className="text-red-600">계획을 불러오지 못했어요.</p>}
      {state.status === 'loaded' && <PlanDetail plan={state.plan} />}
    </main>
  );
}

// 상태별 진입 액션. scheduled는 시작(in_progress 전이) 후 실행 화면으로, in_progress는 바로 이어서.
// completed는 액션 없음(다시 운동하기는 S5 재진입 슬라이스에서).
function PlanActions({ plan }: { plan: Plan }): JSX.Element | null {
  const service = usePlanService();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (plan.status === 'completed') {
    return null;
  }

  const toWorkout = (): void => {
    void navigate({ to: '/workout/$id', params: { id: plan.id } });
  };

  const start = (): void => {
    if (plan.status === 'in_progress') {
      toWorkout();

      return;
    }
    setBusy(true);
    setError(false);
    void service.updateStatus(plan.id, 'in_progress').then(toWorkout, () => {
      setBusy(false);
      setError(true);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {plan.status === 'in_progress' ? '이어서 하기' : '운동 시작'}
      </button>
      {error && <p className="text-sm text-red-600">시작에 실패했어요. 다시 시도해 주세요.</p>}
    </div>
  );
}

function PlanDetail({ plan }: { plan: Plan }): JSX.Element {
  return (
    <article className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">{plan.routineDayLabel}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {plan.date} · {plan.status}
        </p>
        {plan.overloadNote !== undefined && (
          <p className="mt-1 text-xs text-neutral-400">{plan.overloadNote}</p>
        )}
      </div>

      <PlanActions plan={plan} />

      <ul className="flex flex-col gap-4">
        {plan.exercises.map((ex, i) => (
          <li
            key={i}
            className="rounded-xl border border-neutral-200 p-4"
          >
            <h2 className="font-semibold text-neutral-900">{ex.name}</h2>
            {ex.note !== undefined && <p className="text-xs text-neutral-400">{ex.note}</p>}
            <ul className="mt-2 flex flex-col gap-1">
              {ex.sets.map((set, j) => (
                <li
                  key={j}
                  className="flex justify-between text-sm"
                >
                  <span className="text-neutral-500">
                    {set.targetWeightKg}kg × {set.targetReps}회
                  </span>
                  {set.actual !== undefined && (
                    <span className="text-neutral-900">
                      실제 {set.actual.weightKg}kg × {set.actual.reps} (RIR {set.actual.rir})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </article>
  );
}
