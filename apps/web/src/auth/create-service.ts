import type { AuthRepository } from './repository';
import type { AuthService } from './service';

// repository를 주입받아 use-case를 구성한다. 조립은 react 트리 밖(main.tsx)에서만 이뤄진다.
export function createAuthService(repository: AuthRepository): AuthService {
  return {
    async me() {
      return await repository.me();
    },
  };
}
