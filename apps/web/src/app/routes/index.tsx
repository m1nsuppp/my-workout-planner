import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { CurrentUser } from '../../auth/repository';
import { planQueries } from '../../plans/queries';
import { useAuthService } from '../contexts/auth-service-context';
import { usePlanService } from '../contexts/plan-service-context';

export const Route = createFileRoute('/')({
  component: Home,
});

// 로그인/로그아웃은 fetch가 아닌 *브라우저 내비게이션*(OAuth 전체 페이지 리다이렉트)이라
// http client(baseUrl)를 못 탄다. web↔api 서브도메인 분리라 api 절대 URL을 직접 가리킨다.
// dev 프록시(단일 오리진)에선 빈 문자열 → 상대경로로 동작.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// 부팅 시 me()로 현재 사용자를 한 번 확정한다. 소비처가 이 화면뿐이라 여기 둔다
// (두 번째 보호 화면이 생기면 상위로 올린다).
type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: CurrentUser };

function useCurrentUser(): AuthState {
  const authService = useAuthService();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void authService.me().then((user) => {
      if (!alive) {
        return;
      }
      setState(user === null ? { status: 'anonymous' } : { status: 'authenticated', user });
    });

    return () => {
      alive = false;
    };
  }, [authService]);

  return state;
}

function Home(): JSX.Element {
  const auth = useCurrentUser();

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">my-workout-planner</h1>
      {auth.status === 'loading' && <p className="text-neutral-500">불러오는 중…</p>}
      {auth.status === 'anonymous' && (
        // OAuth는 전체 페이지 리다이렉트라 SPA navigate가 아닌 <a>를 쓴다.
        <a
          href={`${API_BASE_URL}/auth/google/start`}
          className="rounded-lg bg-neutral-900 px-4 py-3 text-center font-medium text-white"
        >
          Google로 로그인
        </a>
      )}
      {auth.status === 'authenticated' && (
        <div className="flex flex-col gap-4">
          <p className="text-neutral-700">{auth.user.email} 님으로 로그인됨</p>
          <Link
            to="/routines/new"
            className="rounded-lg bg-neutral-900 px-4 py-3 text-center font-medium text-white"
          >
            루틴 만들기
          </Link>
          <Link
            to="/routines"
            className="rounded-lg border border-neutral-300 px-4 py-3 text-center font-medium text-neutral-700"
          >
            내 루틴
          </Link>

          <PlanList />

          {/* 로그아웃은 sid 쿠키 정리 후 리다이렉트 — 브라우저가 302를 따라가도록 form POST. */}
          <form
            method="post"
            action={`${API_BASE_URL}/auth/logout`}
          >
            <button
              type="submit"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-neutral-700"
            >
              로그아웃
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: '예정',
  in_progress: '운동 중',
  completed: '완료',
};

// 로그인 사용자의 계획 목록(날짜 오름차순). 각 항목은 계획 상세(S6)로 진입한다.
function PlanList(): JSX.Element {
  const service = usePlanService();
  const { data, status } = useQuery(planQueries.list(service));
  const plans = data ?? [];

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-500">내 계획</h2>
      {status === 'pending' && <p className="text-sm text-neutral-400">불러오는 중…</p>}
      {status === 'error' && <p className="text-sm text-red-600">계획을 불러오지 못했어요.</p>}
      {status === 'success' && plans.length === 0 && (
        <p className="text-sm text-neutral-400">
          아직 만든 계획이 없어요. 루틴에서 계획을 만들어 보세요.
        </p>
      )}
      {status === 'success' && plans.length > 0 && (
        <ul className="flex flex-col gap-2">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link
                to="/plans/$id"
                params={{ id: plan.id }}
                className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3"
              >
                <span className="font-medium text-neutral-900">{plan.routineDayLabel}</span>
                <span className="text-sm text-neutral-500">
                  {plan.date} · {STATUS_LABEL[plan.status] ?? plan.status} · {plan.exerciseCount}개
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
