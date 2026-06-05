import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { JSX, SyntheticEvent } from 'react';
import { usePlanService } from '../contexts/plan-service-context';
import { planQueries } from '../../plans/queries';
import type { PlanDraft } from '../../plans/repository';
import { usePlanChat, type PlanChat } from '../../plans/use-plan-chat';

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

// ISODate "YYYY-MM-DD" — ISO 문자열의 날짜 부분(앞 10자).
const ISO_DATE_END = 10;
function todayISODate(): string {
  return new Date().toISOString().slice(0, ISO_DATE_END);
}

// 다음 차례 Day를 먼저 확정한 뒤에야 시드 초안을 받을 수 있으므로, 로딩/에러를 단계로 가른다.
function PlanChatRoute(): JSX.Element {
  const { routineId } = Route.useSearch();
  const service = usePlanService();
  const nextDay = useQuery(planQueries.nextDay(service, routineId));

  if (nextDay.status === 'pending') {
    return <Centered tone="muted">다음 운동을 준비하는 중…</Centered>;
  }
  if (nextDay.status === 'error') {
    return <Centered tone="error">다음 운동 정보를 불러오지 못했어요.</Centered>;
  }

  return (
    <PlanDraftLoader
      routineId={routineId}
      routineDayLabel={nextDay.data.label}
    />
  );
}

// Day가 정해지면 서버 시드 초안(결정적)을 받아 편집 가능한 카드의 초기값으로 쓴다.
function PlanDraftLoader({
  routineId,
  routineDayLabel,
}: {
  routineId: string;
  routineDayLabel: string;
}): JSX.Element {
  const service = usePlanService();
  const [date] = useState(todayISODate);
  const seed = useQuery(planQueries.draft(service, routineId, routineDayLabel, date));

  if (seed.status === 'pending') {
    return <Centered tone="muted">오늘 계획 초안을 만드는 중…</Centered>;
  }
  if (seed.status === 'error') {
    return <Centered tone="error">계획 초안을 불러오지 못했어요.</Centered>;
  }

  return (
    <PlanChatScreen
      routineId={routineId}
      routineDayLabel={routineDayLabel}
      date={date}
      initialDraft={seed.data}
    />
  );
}

function Centered({ tone, children }: { tone: 'muted' | 'error'; children: string }): JSX.Element {
  return (
    <main className="flex flex-1 flex-col p-6">
      <p className={tone === 'error' ? 'text-red-600' : 'text-neutral-500'}>{children}</p>
    </main>
  );
}

// 컨디션은 닫힌 질문이라 자유 입력 대신 칩으로 받는다(정해진 문장을 대화로 보낸다).
const CONDITION_CHIPS = [
  { label: '좋음', message: '오늘 컨디션 좋음(평소보다 잘 됨).' },
  { label: '보통', message: '오늘 컨디션 보통.' },
  { label: '별로', message: '오늘 컨디션 별로(무리하지 않게).' },
] as const;

function PlanChatScreen({
  routineId,
  routineDayLabel,
  date,
  initialDraft,
}: {
  routineId: string;
  routineDayLabel: string;
  date: string;
  initialDraft: PlanDraft;
}): JSX.Element {
  const chat = usePlanChat({ routineId, routineDayLabel, date }, initialDraft);
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const busy = chat.status === 'sending';

  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const text = input.trim();
    if (text === '' || busy) {
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

      <PlanCard
        draft={chat.draft}
        editSet={chat.editSet}
        onConfirm={confirm}
        creating={chat.status === 'creating'}
      />

      <section className="flex flex-wrap items-center gap-2 pt-4">
        <span className="text-sm text-neutral-500">오늘 컨디션</span>
        {CONDITION_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            disabled={busy}
            onClick={() => chat.send(chip.message)}
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-700 disabled:opacity-40"
          >
            {chip.label}
          </button>
        ))}
      </section>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pt-4">
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
        {busy && chat.streaming === '' && (
          <p className="text-sm text-neutral-400">코치가 작성 중…</p>
        )}
        {chat.status === 'chatError' && (
          <p className="text-sm text-red-600">응답을 받지 못했어요. 다시 보내주세요.</p>
        )}
        {chat.status === 'createError' && (
          <p className="text-sm text-red-600">계획 저장에 실패했어요. 다시 시도해 주세요.</p>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 스쿼트 50으로, 벤치 대신 인클라인"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
        />
        <button
          type="submit"
          disabled={busy}
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

// 항상 채워진 편집 카드 — 세트별 무게·횟수를 직접 고치고, 확정으로 저장한다.
function PlanCard({
  draft,
  editSet,
  onConfirm,
  creating,
}: {
  draft: PlanDraft;
  editSet: PlanChat['editSet'];
  onConfirm: () => void;
  creating: boolean;
}): JSX.Element {
  const empty = draft.exercises.length === 0;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="font-bold text-neutral-900">{draft.routineDayLabel}</h2>
      {draft.overloadNote !== undefined && (
        <p className="pt-1 text-xs text-neutral-500">{draft.overloadNote}</p>
      )}

      {empty ? (
        <p className="pt-3 text-sm text-neutral-500">
          이 Day에 정의된 운동이 없어요. 대화로 어떤 운동을 할지 알려주세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-4 pt-3">
          {draft.exercises.map((ex, exIndex) => (
            <li key={exIndex}>
              <p className="text-sm font-medium text-neutral-800">{ex.name}</p>
              <ul className="flex flex-col gap-1 pt-1">
                {ex.sets.map((set, setIndex) => (
                  <li
                    key={setIndex}
                    className="flex items-center gap-2 text-sm text-neutral-600"
                  >
                    <span className="w-12 text-neutral-400">{setIndex + 1}세트</span>
                    <NumberField
                      label="kg"
                      value={set.targetWeightKg}
                      step={2.5}
                      min={0}
                      onChange={(targetWeightKg) => editSet(exIndex, setIndex, { targetWeightKg })}
                    />
                    <NumberField
                      label="회"
                      value={set.targetReps}
                      step={1}
                      min={1}
                      onChange={(targetReps) => editSet(exIndex, setIndex, { targetReps })}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={creating || empty}
        className="mt-4 w-full rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {creating ? '저장 중…' : '이 계획으로 확정'}
      </button>
    </section>
  );
}

function NumberField({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          onChange(Number.isNaN(parsed) ? min : Math.max(min, parsed));
        }}
        className="w-16 rounded border border-neutral-300 px-2 py-1 text-right text-neutral-900"
      />
      <span className="text-neutral-400">{label}</span>
    </label>
  );
}
