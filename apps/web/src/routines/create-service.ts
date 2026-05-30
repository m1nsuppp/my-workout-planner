import type { RoutineRepository } from './repository';
import type { RoutineService } from './service';

// repository를 주입받아 use-case를 구성한다. 조립은 react 트리 밖(main.tsx)에서만 이뤄지고,
// react는 RoutineService만 알기에 여기 로직이 늘어도 화면 코드는 불변이다.
export function createRoutineService(repository: RoutineRepository): RoutineService {
  return {
    async list() {
      return await repository.list();
    },
    async get(id) {
      return await repository.get(id);
    },
    async create(draft) {
      return await repository.create(draft);
    },
  };
}
