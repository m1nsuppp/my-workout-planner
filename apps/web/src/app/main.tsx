import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createFetchHttpClient } from '../http/create-fetch-http-client';
import { createRoutineRepository } from '../routines/create-repository';
import { RepositoryProvider, type Repositories } from './repository-context';
import { routeTree } from './route-tree.gen';

const router = createRouter({ routeTree });

// 프로덕션 조립부 — HTTP 구현을 repository에 주입한다(테스트는 fake로 대체).
// baseUrl은 dev 프록시에선 빈 문자열, 서브도메인 분리 시 VITE_API_BASE_URL로 지정.
const httpClient = createFetchHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' });
const repositories: Repositories = {
  routines: createRoutineRepository(httpClient),
};

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
    <RepositoryProvider repositories={repositories}>
      <RouterProvider router={router} />
    </RepositoryProvider>
  </StrictMode>,
);
