import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { RoutineRepository } from '../routines/repository';

// 앱 전역에 주입되는 repository 모음. 프로덕션은 HTTP 구현을, 테스트는 fake를 넣는다.
export interface Repositories {
  routines: RoutineRepository;
}

const RepositoryContext = createContext<Repositories | null>(null);

export function RepositoryProvider({
  repositories,
  children,
}: {
  repositories: Repositories;
  children: ReactNode;
}): ReactElement {
  return <RepositoryContext.Provider value={repositories}>{children}</RepositoryContext.Provider>;
}

function useRepositories(): Repositories {
  const repositories = useContext(RepositoryContext);
  if (repositories === null) {
    throw new Error('RepositoryProvider 밖에서 repository를 사용할 수 없습니다.');
  }

  return repositories;
}

export function useRoutineRepository(): RoutineRepository {
  return useRepositories().routines;
}
