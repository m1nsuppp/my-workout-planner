import type { PlanRepository } from './repository';
import type { PlanService } from './service';

// repository를 주입받아 use-case를 구성한다. 조립은 react 트리 밖(main.tsx)에서만 이뤄지고,
// react는 PlanService만 알기에 여기 로직이 늘어도 화면 코드는 불변이다.
export function createPlanService(repository: PlanRepository): PlanService {
  return {
    async get(id) {
      return await repository.get(id);
    },
    async create(draft) {
      return await repository.create(draft);
    },
    async nextDay(routineId) {
      return await repository.nextDay(routineId);
    },
    async chat(input, onDelta) {
      return await repository.chat(input, onDelta);
    },
    async updateStatus(planId, status) {
      return await repository.updateStatus(planId, status);
    },
    async updateSet(setId, record) {
      return await repository.updateSet(setId, record);
    },
    async coach(planId, history, onDelta) {
      return await repository.coach(planId, history, onDelta);
    },
    async applyCoach(planId, change, idempotencyKey) {
      return await repository.applyCoach(planId, change, idempotencyKey);
    },
  };
}
