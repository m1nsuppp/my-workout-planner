import type {
  DayTemplateExercise,
  NewPlan,
  NewPlanExercise,
  NewPlannedSet,
  OverloadRecord,
  PlanDateRange,
  PlanExerciseRecord,
  PlanRecord,
  PlanRepository,
  PlanSummaryRecord,
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

// 코치 변경안 적용이 중복(멱등성 키 재사용)이라 거부됨. 컨트롤러가 409로 변환한다.
export class CoachIdempotencyError extends Error {
  constructor() {
    super('coach change already applied');
    this.name = 'CoachIdempotencyError';
  }
}

// 코치 변경안이 규칙을 위반함(대상 없음·근육군 불일치·완료세트 보호·dropSets 초과). 컨트롤러가 422로 변환한다.
export class CoachApplyError extends Error {
  constructor(readonly issues: string[]) {
    super('coach change rejected');
    this.name = 'CoachApplyError';
  }
}

// 라우트가 계약 ApplyableChange를 도메인 변형 명세로 매핑해 넘긴다(substitute.replacement는 도메인 운동).
export type CoachChangeInput =
  | { kind: 'substitute'; targetExerciseName: string; replacement: NewPlanExercise; reason: string }
  | {
      kind: 'adjust_load';
      targetExerciseName: string;
      weightFactor: number;
      repsDelta?: number;
      dropSets?: number;
      reason: string;
    };

const PLATE_STEP = 2.5; // 무게는 2.5kg 단위로 반올림(운동 철학: roundToPlate)
const MIN_REPS = 1; // 목표 반복은 양의 정수 유지

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
  list: (userId: string, range?: PlanDateRange) => Promise<PlanSummaryRecord[]>;
  nextDay: (userId: string, routineId: string) => Promise<RoutineDayRef | null>;
  // 대상 Day(label)의 과부하 근거 조립. label이 루틴에 없으면 빈 배열.
  overloadFor: (
    userId: string,
    routineId: string,
    routineDayLabel: string,
  ) => Promise<OverloadRecord[]>;
  // 대상 Day(label)에 정의된 운동 템플릿. 계획 생성 대화의 grounding. label이 루틴에 없으면 빈 배열.
  templateFor: (
    userId: string,
    routineId: string,
    routineDayLabel: string,
  ) => Promise<DayTemplateExercise[]>;
  // 계획 생성 진입 시드 초안(LLM 없이 결정적). Day 템플릿 × targetSets,
  // 무게=직전 동일 운동의 작업 무게 carry ?? 0(첫 수행), 횟수=목표 반복 하한.
  seedDraft: (
    userId: string,
    routineId: string,
    routineDayLabel: string,
    date: string,
  ) => Promise<NewPlan>;
  // 상태 전이. 없으면 null(404), 허용 안 된 전이면 InvalidPlanTransitionError(409).
  updateStatus: (userId: string, id: string, status: string) => Promise<PlanRecord | null>;
  // 세트 실제 수행값 기록. setId가 없거나 타 유저면 null. completedAt은 라우트가 찍어 넘긴다.
  updateSet: (
    userId: string,
    setId: string,
    actual: SetRecordInput,
  ) => Promise<NewPlannedSet | null>;
  // 코치 변경안 적용(S8). plan이 없거나 타 유저면 null(404).
  // in_progress가 아니면 InvalidPlanTransitionError(409), 규칙 위반은 CoachApplyError(422),
  // 멱등성 키 중복은 CoachIdempotencyError(409). 성공 시 변형된 PlanRecord.
  applyCoachChange: (
    userId: string,
    planId: string,
    change: CoachChangeInput,
    apply: { idempotencyKey: string; appliedAt: string },
  ) => Promise<PlanRecord | null>;
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
        input.routineDayId ??
        (await repo.findDayId(userId, input.routineId, input.routineDayLabel));

      return await repo.create(userId, { ...input, routineDayId });
    },
    get: async (userId, id) => await repo.findById(userId, id),
    list: async (userId, range) => await repo.listSummaries(userId, range),
    nextDay: async (userId, routineId) => await repo.nextDay(userId, routineId),
    overloadFor: async (userId, routineId, routineDayLabel) => {
      const dayId = await repo.findDayId(userId, routineId, routineDayLabel);

      return dayId === null ? [] : await repo.lastOverload(userId, routineId, dayId);
    },
    templateFor: async (userId, routineId, routineDayLabel) =>
      await repo.dayTemplate(userId, routineId, routineDayLabel),
    seedDraft: async (userId, routineId, routineDayLabel, date) => {
      const dayId = await repo.findDayId(userId, routineId, routineDayLabel);
      const [template, overloads] = await Promise.all([
        repo.dayTemplate(userId, routineId, routineDayLabel),
        dayId === null ? Promise.resolve([]) : repo.lastOverload(userId, routineId, dayId),
      ]);
      // 직전 동일 운동의 작업 무게(첫 세트)를 carry. 없으면 0(첫 수행 → 사용자/대화가 채움).
      const lastWeight = new Map(overloads.map((o) => [o.exerciseName, o.sets[0]?.weightKg ?? 0]));

      return {
        routineId,
        routineDayLabel,
        date,
        exercises: template.map((t) => ({
          name: t.name,
          muscleGroups: t.muscleGroups,
          sets: Array.from({ length: Math.max(1, t.targetSets) }, () => ({
            targetWeightKg: lastWeight.get(t.name) ?? 0,
            targetReps: Math.max(MIN_REPS, t.targetRepRange[0]),
          })),
        })),
      };
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
    applyCoachChange: async (userId, planId, change, apply) => {
      const plan = await repo.findById(userId, planId);
      if (plan === null) {
        return null;
      }
      // 운동 중(in_progress)에만 코치가 개입한다 — 그 외 상태는 적용 거부.
      if (plan.status !== 'in_progress') {
        throw new InvalidPlanTransitionError(plan.status, 'coach_apply');
      }

      const exercises = applyChange(plan.exercises, change);
      const result = await repo.applyCoachChange(userId, planId, { exercises, ...apply });
      if (result === 'conflict') {
        throw new CoachIdempotencyError();
      }

      return result;
    },
  };
}

const newId = (): string => crypto.randomUUID();

// 변형 결과(최종 운동 목록)를 계산한다. 규칙 위반은 CoachApplyError로 throw(컨트롤러가 422).
// 가드: 대상 실재 / substitute는 근육군 합치·완료세트 보호 / adjust_load는 미완료 세트에만·dropSets 한도.
function applyChange(
  exercises: PlanExerciseRecord[],
  change: CoachChangeInput,
): PlanExerciseRecord[] {
  const idx = exercises.findIndex((e) => e.name === change.targetExerciseName);
  if (idx === -1) {
    throw new CoachApplyError([`대상 운동 "${change.targetExerciseName}"을(를) 찾을 수 없습니다.`]);
  }
  const target = exercises[idx];
  const replaced =
    change.kind === 'substitute' ? substitute(target, change) : adjustLoad(target, change);

  return exercises.map((e, i) => (i === idx ? replaced : e));
}

function substitute(
  target: PlanExerciseRecord,
  change: Extract<CoachChangeInput, { kind: 'substitute' }>,
): PlanExerciseRecord {
  // 완료 세트 보호 — 이미 수행한 기록이 있으면 운동 자체를 갈아끼우지 않는다(보수적).
  if (target.sets.some((s) => s.actual !== undefined)) {
    throw new CoachApplyError(['이미 수행한 세트가 있어 운동을 교체할 수 없습니다.']);
  }
  // 동일 근육군 우선 — 원본과 최소 하나의 근육군을 공유해야 한다.
  const shares = change.replacement.muscleGroups.some((m) => target.muscleGroups.includes(m));
  if (!shares) {
    throw new CoachApplyError(['교체 운동의 근육군이 원본과 맞지 않습니다.']);
  }

  return {
    name: change.replacement.name,
    muscleGroups: change.replacement.muscleGroups,
    note: change.reason, // 교체 사유를 메모로 남겨 흔적을 보존한다.
    sets: change.replacement.sets.map((s) => ({ ...s, id: newId() })),
  };
}

function adjustLoad(
  target: PlanExerciseRecord,
  change: Extract<CoachChangeInput, { kind: 'adjust_load' }>,
): PlanExerciseRecord {
  // 완료 세트는 불변, 남은(미완료) 세트에만 적용한다.
  const done = target.sets.filter((s) => s.actual !== undefined);
  const pending = target.sets.filter((s) => s.actual === undefined);

  const drop = change.dropSets ?? 0;
  if (drop > pending.length) {
    throw new CoachApplyError(['줄이려는 세트 수가 남은 세트보다 많습니다.']);
  }
  const kept = pending.slice(0, pending.length - drop);
  const adjusted = kept.map((s) => ({
    ...s,
    targetWeightKg: Math.round((s.targetWeightKg * change.weightFactor) / PLATE_STEP) * PLATE_STEP,
    targetReps: Math.max(MIN_REPS, s.targetReps + (change.repsDelta ?? 0)),
  }));

  return { ...target, sets: [...done, ...adjusted] };
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
