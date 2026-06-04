import type { NewPlan, OverloadRecord, PlanRecord, PlanRepository, RoutineDayRef } from './repository';

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
  nextDay: (userId: string, routineId: string) => Promise<RoutineDayRef | null>;
  // 대상 Day(label)의 과부하 근거 조립. label이 루틴에 없으면 빈 배열.
  overloadFor: (
    userId: string,
    routineId: string,
    routineDayLabel: string,
  ) => Promise<OverloadRecord[]>;
}

export function createPlanService(repo: PlanRepository): PlanService {
  return {
    create: async (userId, input) => {
      const issues = validate(input);
      if (issues.length > 0) {
        throw new PlanValidationError(issues);
      }

      // 확정 시점에 label → routine_days.id를 역조회해 FK를 채운다(next-day 추적의 토대).
      // 못 찾으면(루틴 수정/삭제) null로 저장 — data-model의 ON DELETE SET NULL 의도와 정합.
      const routineDayId =
        input.routineDayId ?? (await repo.findDayId(userId, input.routineId, input.routineDayLabel));

      return await repo.create(userId, { ...input, routineDayId });
    },
    get: async (userId, id) => await repo.findById(userId, id),
    nextDay: async (userId, routineId) => await repo.nextDay(userId, routineId),
    overloadFor: async (userId, routineId, routineDayLabel) => {
      const dayId = await repo.findDayId(userId, routineId, routineDayLabel);

      return dayId === null ? [] : await repo.lastOverload(userId, routineId, dayId);
    },
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
