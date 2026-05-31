import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { AuthService } from '../../auth/service';

// 라우터 라이프사이클(beforeLoad 가드)에서 쓰는 의존성. react 트리의 context와 별개 레이어다.
export interface RouterContext {
  authService: AuthService;
}

// 단일 모바일 UI(screens.md) — 데스크톱에서도 420px 고정폭으로 중앙 배치, 바깥은 빈 배경.
export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="flex min-h-dvh justify-center bg-neutral-100">
      <div className="flex min-h-dvh w-full max-w-[420px] flex-col bg-white">
        <Outlet />
      </div>
    </div>
  ),
});
