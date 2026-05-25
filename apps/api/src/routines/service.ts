import type { NewRoutine, RoutineRecord, RoutineRepository } from './repository';

// 도메인 규칙 위반. 컨트롤러가 422 봉투로 변환한다.
export class RoutineValidationError extends Error {
  constructor(readonly issues: string[]) {
    super('routine validation failed');
    this.name = 'RoutineValidationError';
  }
}

// 애플리케이션 레이어. 도메인 의미(불변식)를 강제하고 영속을 오케스트레이션한다.
// 구조 검증(타입·비어있지 않음)은 contract(zod)가 경계에서 이미 거른다.
export interface RoutineService {
  create: (userId: string, input: NewRoutine) => Promise<RoutineRecord>;
  list: (userId: string) => Promise<RoutineRecord[]>;
  get: (userId: string, id: string) => Promise<RoutineRecord | null>;
}

export function createRoutineService(repo: RoutineRepository): RoutineService {
  return {
    create: async (userId, input) => {
      const issues = validate(input);
      if (issues.length > 0) {
        throw new RoutineValidationError(issues);
      }

      return await repo.create(userId, input);
    },
    list: async (userId) => await repo.list(userId),
    get: async (userId, id) => await repo.findById(userId, id),
  };
}

// "유효한 루틴인가"의 의미 규칙. 위반 메시지 목록을 모아 반환.
function validate(routine: NewRoutine): string[] {
  const issues: string[] = [];

  if (routine.days.length === 0) {
    issues.push('루틴에는 최소 1개의 Day가 필요합니다.');
  }

  const seenLabels = new Set<string>();
  for (const day of routine.days) {
    if (seenLabels.has(day.label)) {
      issues.push(`Day label이 중복됩니다: ${day.label}`);
    }
    seenLabels.add(day.label);

    if (day.exercises.length === 0) {
      issues.push(`Day "${day.label}"에 운동이 없습니다.`);
    }

    for (const ex of day.exercises) {
      const [repMin, repMax] = ex.targetRepRange;
      if (repMin > repMax) {
        issues.push(`운동 "${ex.name}"의 rep 범위가 잘못되었습니다(min > max).`);
      }
      if (ex.muscleGroups.length === 0) {
        issues.push(`운동 "${ex.name}"에 근육군이 없습니다.`);
      }
    }
  }

  return issues;
}
