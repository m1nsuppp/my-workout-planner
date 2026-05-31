import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { AuthService } from '../../auth/service';

// 인증 service를 react에 잇는 어댑터 — 도메인별로 분리해, 화면 테스트 시
// 이 Provider에 fake service 하나만 주면 된다(routine-service-context와 같은 형태).
const AuthServiceContext = createContext<AuthService | null>(null);

export function AuthServiceProvider({
  service,
  children,
}: {
  service: AuthService;
  children: ReactNode;
}): ReactElement {
  return <AuthServiceContext.Provider value={service}>{children}</AuthServiceContext.Provider>;
}

export function useAuthService(): AuthService {
  const service = useContext(AuthServiceContext);
  if (service === null) {
    throw new Error('AuthServiceProvider 밖에서 useAuthService를 사용할 수 없습니다.');
  }

  return service;
}
