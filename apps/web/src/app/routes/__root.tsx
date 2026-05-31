import { Outlet, createRootRoute } from '@tanstack/react-router';

// 단일 모바일 UI(screens.md) — 데스크톱에서도 420px 고정폭으로 중앙 배치, 바깥은 빈 배경.
export const Route = createRootRoute({
  component: () => (
    <div className="flex min-h-dvh justify-center bg-neutral-100">
      <div className="flex min-h-dvh w-full max-w-[420px] flex-col bg-white">
        <Outlet />
      </div>
    </div>
  ),
});
