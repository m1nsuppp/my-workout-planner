import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { JSX } from 'react';
import { usePlanService } from '../contexts/plan-service-context';
import type { Plan, PlannedSet } from '../../plans/repository';
import { usePlan } from '../../plans/use-plan';

export const Route = createFileRoute('/workout/$id')({
  // 보호 라우트 — 미로그인이면 콘텐츠 렌더 전에 홈으로 돌린다.
  beforeLoad: async ({ context }) => {
    const user = await context.authService.me();
    if (user === null) {
      throw redirect({ to: '/' });
    }
  },
  component: WorkoutRoute,
});

function WorkoutRoute(): JSX.Element {
  const { id } = Route.useParams();
  const state = usePlan(id);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      {state.status === 'loading' && <p className="text-neutral-500">불러오는 중…</p>}
      {state.status === 'notfound' && <p className="text-neutral-500">계획을 찾을 수 없어요.</p>}
      {state.status === 'error' && <p className="text-red-600">계획을 불러오지 못했어요.</p>}
      {state.status === 'loaded' && <WorkoutSession plan={state.plan} />}
    </main>
  );
}

function WorkoutSession({ plan }: { plan: Plan }): JSX.Element {
  const service = usePlanService();
  const navigate = useNavigate();
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);

  const finish = (): void => {
    setFinishing(true);
    setFinishError(false);
    void service.updateStatus(plan.id, 'completed').then(
      () => {
        void navigate({ to: '/plans/$id', params: { id: plan.id } });
      },
      () => {
        setFinishing(false);
        setFinishError(true);
      },
    );
  };

  return (
    <>
      <header>
        <h1 className="text-xl font-bold text-neutral-900">{plan.routineDayLabel}</h1>
        <p className="mt-1 text-sm text-neutral-500">{plan.date} · 운동 중</p>
      </header>

      <div className="flex flex-col gap-4">
        {plan.exercises.map((ex, i) => (
          <section
            key={i}
            className="rounded-xl border border-neutral-200 p-4"
          >
            <h2 className="font-semibold text-neutral-900">{ex.name}</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {ex.sets.map((set) => (
                <li key={set.id}>
                  <SetRow set={set} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {finishError && <p className="text-sm text-red-600">운동 종료에 실패했어요. 다시 시도해 주세요.</p>}
      <button
        type="button"
        onClick={finish}
        disabled={finishing}
        className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {finishing ? '종료하는 중…' : '운동 종료'}
      </button>
    </>
  );
}

// 세트 한 줄 — 목표값을 기본으로 채우고, 실제 수행값(무게/횟수/RIR)을 기록한다.
function SetRow({ set }: { set: PlannedSet }): JSX.Element {
  const service = usePlanService();
  const [weightKg, setWeightKg] = useState(String(set.actual?.weightKg ?? set.targetWeightKg));
  const [reps, setReps] = useState(String(set.actual?.reps ?? set.targetReps));
  const [rir, setRir] = useState(set.actual === undefined ? '' : String(set.actual.rir));
  const [recorded, setRecorded] = useState(set.actual !== undefined);
  const [saving, setSaving] = useState(false);

  const record = (): void => {
    setSaving(true);
    void service
      .updateSet(set.id, { weightKg: Number(weightKg), reps: Number(reps), rir: Number(rir) })
      .then(
        () => {
          setRecorded(true);
          setSaving(false);
        },
        () => {
          setSaving(false);
        },
      );
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <NumberField
        value={weightKg}
        onChange={setWeightKg}
        suffix="kg"
      />
      <NumberField
        value={reps}
        onChange={setReps}
        suffix="회"
      />
      <NumberField
        value={rir}
        onChange={setRir}
        suffix="RIR"
      />
      <button
        type="button"
        onClick={record}
        disabled={saving}
        className={`ml-auto rounded-lg px-3 py-1 font-medium disabled:opacity-40 ${
          recorded ? 'bg-neutral-100 text-neutral-500' : 'bg-neutral-900 text-white'
        }`}
      >
        {recorded ? '기록됨 ✓' : '기록'}
      </button>
    </div>
  );
}

function NumberField({
  value,
  onChange,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}): JSX.Element {
  return (
    <label className="flex items-center gap-1 text-neutral-600">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 rounded border border-neutral-300 px-2 py-1 text-neutral-900"
      />
      {suffix}
    </label>
  );
}
