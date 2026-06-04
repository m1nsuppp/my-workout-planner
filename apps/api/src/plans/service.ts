import type {
  NewPlan,
  NewPlannedSet,
  OverloadRecord,
  PlanRecord,
  PlanRepository,
  RoutineDayRef,
  SetRecordInput,
} from './repository';

// 도메인 규칙 위반. 컨트롤러가 422 봉투로 변환한다.
export class PlanValidationError extends Error {
  constructor(readonly issues: string[]) {
    super('plan validation failed');
    this.name = 'PlanValidationError';
  }
}

// 허용되지 않은 상태 전이(역전이·completed에서 출발 등). 컨트롤러가 409로 변환한다.
export class InvalidPlanTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`invalid plan transition: ${from} → ${to}`);
    this.name = 'InvalidPlanTransitionError';
  }
}

// 허용 전이만 명시(data-model 상태기계): scheduled→in_progress→completed, 그 외 거부.
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  scheduled: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
};

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
  // 상태 전이. 없으면 null(404), 허용 안 된 전이면 InvalidPlanTransitionError(409).
  updateStatus: (userId: string, id: string, status: string) => Promise<PlanRecord | null>;
  // 세트 실제 수행값 기록. setId가 없거나 타 유저면 null. completedAt은 라우트가 찍어 넘긴다.
  updateSet: (
    userId: string,
    setId: string,
    actual: SetRecordInput,
  ) => Promise<NewPlannedSet | null>;
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
    updateStatus: async (userId, id, status) => {
      const current = await repo.findById(userId, id);
      if (current === null) {
        return null;
      }
      if (!(ALLOWED_TRANSITIONS[current.status] ?? []).includes(status)) {
        throw new InvalidPlanTransitionError(current.status, status);
      }

      return await repo.updateStatus(userId, id, status);
    },
    updateSet: async (userId, setId, actual) => await repo.updateSet(userId, setId, actual),
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
