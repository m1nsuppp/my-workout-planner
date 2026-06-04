import type { NewPlan, PlanRecord, PlanRepository } from './repository';

// 도메인 규칙 위반. 컨트롤러가 422 봉투로 변환한다.
export class PlanValidationError extends Error {
  constructor(readonly issues: string[]) {
    super('plan validation failed');
    this.name = 'PlanValidationError';
  }
}

// 애플리케이션 레이어. 도메인 의미(불변식)를 강제하고 영속을 오케스트레이션한다.
// 구조 검증(타입·수치 부호)은 contract(zod)가 경계에서 이미 거른다.
export interface PlanService {
  create: (userId: string, input: NewPlan) => Promise<PlanRecord>;
  get: (userId: string, id: string) => Promise<PlanRecord | null>;
}

export function createPlanService(repo: PlanRepository): PlanService {
  return {
    create: async (userId, input) => {
      const issues = validate(input);
      if (issues.length > 0) {
        throw new PlanValidationError(issues);
      }

      return await repo.create(userId, input);
    },
    get: async (userId, id) => await repo.findById(userId, id),
  };
}

// "실행 가능한 계획인가"의 의미 규칙. 위반 메시지 목록을 모아 반환.
function validate(plan: NewPlan): string[] {
  const issues: string[] = [];

  if (plan.exercises.length === 0) {
    issues.push('계획에는 최소 1개의 운동이 필요합니다.');
  }

  for (const ex of plan.exercises) {
    if (ex.sets.length === 0) {
      issues.push(`운동 "${ex.name}"에 세트가 없습니다.`);
    }
  }

  return issues;
}
