import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { CurrentUser } from '../../auth/repository';
import { useAuthService } from '../contexts/auth-service-context';

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
            to="/routines"
            className="rounded-lg bg-neutral-900 px-4 py-3 text-center font-medium text-white"
          >
            내 루틴
          </Link>
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
