import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { createFetchHttpClient } from '../http/create-fetch-http-client';
import { createAuthRepository } from '../auth/create-repository';
import { createAuthService } from '../auth/create-service';
import { createRoutineRepository } from '../routines/create-repository';
import { createRoutineService } from '../routines/create-service';
import { createPlanRepository } from '../plans/create-repository';
import { createPlanService } from '../plans/create-service';
import { AuthServiceProvider } from './contexts/auth-service-context';
import { RoutineServiceProvider } from './contexts/routine-service-context';
import { PlanServiceProvider } from './contexts/plan-service-context';
import { routeTree } from './route-tree.gen';

// 프로덕션 조립부 — http → repository → service로 엮어 주입한다(테스트는 fake로 대체).
// react 트리는 service만 알기에 repository·http는 이 조립부에서만 보인다.
// 도메인별 Provider라, 추가되면 여기서 중첩한다(예: <PlanServiceProvider>…).
// baseUrl은 dev 프록시에선 빈 문자열, 서브도메인 분리 시 VITE_API_BASE_URL로 지정.
const httpClient = createFetchHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' });
const routineService = createRoutineService(createRoutineRepository(httpClient));
const planService = createPlanService(createPlanRepository(httpClient));
const authService = createAuthService(createAuthRepository(httpClient));

// authService를 router context에 주입 — 보호 라우트의 beforeLoad 가드가 me()를 쓴다.
const router = createRouter({ routeTree, context: { authService } });

// 라우터 타입을 전역에 등록해 Link·navigate 등이 경로를 타입 체크하도록 한다.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('루트 엘리먼트(#root)를 찾을 수 없습니다.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AuthServiceProvider service={authService}>
      <RoutineServiceProvider service={routineService}>
        <PlanServiceProvider service={planService}>
          <RouterProvider router={router} />
        </PlanServiceProvider>
      </RoutineServiceProvider>
    </AuthServiceProvider>
  </StrictMode>,
);
