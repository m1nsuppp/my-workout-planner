import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import { render, waitFor, type RenderResult } from '@testing-library/react';
import { expect } from 'vitest';
import { MeResponseDto } from '@workout/contracts';
import type { CurrentUser } from '../../auth/repository';
import type { AuthService } from '../../auth/service';
import type { PlanService } from '../../plans/service';
import type { RoutineService } from '../../routines/service';
import { AuthServiceProvider } from '../contexts/auth-service-context';
import { PlanServiceProvider } from '../contexts/plan-service-context';
import { RoutineServiceProvider } from '../contexts/routine-service-context';
import { routeTree } from '../route-tree.gen';

// 호출되면 테스트 설계가 틀렸다는 신호 — 라우트가 기대 밖 service 메서드를 건드렸다.
const rejectUnused = async (): Promise<never> =>
  await Promise.reject(new Error('이 테스트에서 호출되지 않아야 하는 service 메서드입니다.'));

// 보호 라우트 가드가 통과시키는 기본 로그인 사용자. id가 평문이라 DTO로 parse해 검증 통과분을 쓴다.
export const authedUser: CurrentUser = (() => {
  const envelope = MeResponseDto.parse({ ok: true, data: { id: 'u1', email: 'me@example.com' } });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
})();

// beforeLoad 가드가 쓰는 me()만 채운 fake — 기본은 로그인 상태, 미로그인은 me로 override한다.
export function fakeAuthService(over: Partial<AuthService> = {}): AuthService {
  return { me: async () => await Promise.resolve(authedUser), ...over };
}

export function fakePlanService(over: Partial<PlanService> = {}): PlanService {
  return {
    get: rejectUnused,
    list: rejectUnused,
    create: rejectUnused,
    nextDay: rejectUnused,
    chat: rejectUnused,
    updateStatus: rejectUnused,
    updateSet: rejectUnused,
    coach: rejectUnused,
    applyCoach: rejectUnused,
    ...over,
  };
}

export function fakeRoutineService(over: Partial<RoutineService> = {}): RoutineService {
  return {
    list: rejectUnused,
    get: rejectUnused,
    create: rejectUnused,
    chat: rejectUnused,
    ...over,
  };
}

export interface RenderRouteServices {
  authService?: AuthService;
  planService?: PlanService;
  routineService?: RoutineService;
}

// 메모리 라우터로 라우트 트리를 실제 마운트한다 — 라우트 컴포넌트가 router 훅(useParams/useSearch)과
// 가드(beforeLoad)에 의존하므로 컴포넌트만 떼어내지 않고, main.tsx와 같은 조립을 그대로 재현한다.
export async function renderRoute(
  path: string,
  services: RenderRouteServices = {},
): Promise<RenderResult & { router: AnyRouter }> {
  const authService = services.authService ?? fakeAuthService();
  const planService = services.planService ?? fakePlanService();
  const routineService = services.routineService ?? fakeRoutineService();

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { authService },
  });

  const result = render(
    <AuthServiceProvider service={authService}>
      <RoutineServiceProvider service={routineService}>
        <PlanServiceProvider service={planService}>
          <RouterProvider router={router} />
        </PlanServiceProvider>
      </RoutineServiceProvider>
    </AuthServiceProvider>,
  );

  // 가드·로더가 끝나 첫 화면이 확정될 때까지 기다린다(컴포넌트 내부 effect는 각 테스트가 findBy로 대기).
  await waitFor(() => expect(router.state.status).toBe('idle'));

  return Object.assign(result, { router });
}
