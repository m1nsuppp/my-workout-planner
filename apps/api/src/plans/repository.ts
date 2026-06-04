// 계획 저장소 포트. 사용하는 쪽(라우트 핸들러) 관점에서 설계한다.
// api 내부 도메인 타입(NewPlan/PlanRecord)을 쓰고, 계약 DTO는 경계(라우트)에서만 매핑한다.
// 리포지토리는 도메인 검증을 하지 않는다(그건 service 책임) — 받은 값을 무손실로 저장·복원만 한다.

// 세트 수행 기록(SetRecord). 계획 생성 시점엔 보통 없고, 운동 실행(S7)에서 채워진다.
export interface SetRecordInput {
  weightKg: number;
  reps: number;
  rir: number;
  completedAt: string;
}

export interface NewPlannedSet {
  targetWeightKg: number;
  targetReps: number;
  actual?: SetRecordInput; // 미수행이면 undefined
}

export interface NewPlanExercise {
  name: string;
  muscleGroups: string[];
  sets: NewPlannedSet[];
  note?: string;
}

export interface NewPlan {
  routineId: string;
  // 어느 Day인지의 식별자. next-day 계산 결과로 서버가 채운다(없으면 null로 저장).
  routineDayId?: string | null;
  routineDayLabel: string; // 표시용 스냅샷
  date: string; // ISODate
  overloadNote?: string;
  exercises: NewPlanExercise[];
}

export interface PlanRecord extends NewPlan {
  id: string;
  status: string; // 'scheduled' | 'in_progress' | 'completed'
  createdAt: string;
}

// 루틴의 한 "Day" 참조. next-day 계산 결과 — 어느 Day를 이번에 소화할지.
export interface RoutineDayRef {
  routineDayId: string;
  label: string;
  orderIndex: number;
}

// 직전 동일 Day 완료 세션의 운동별 실제 수행 기록 — 점진적 과부하 제안의 데이터 근거.
export interface OverloadRecord {
  exerciseName: string;
  sets: SetRecordInput[];
}

export interface PlanRepository {
  create: (userId: string, plan: NewPlan) => Promise<PlanRecord>;
  findById: (userId: string, id: string) => Promise<PlanRecord | null>;
  // 이 루틴에서 다음에 소화할 Day(마지막 완료 Day의 다음, 한 바퀴 돌면 처음으로).
  // 완료 이력이 없으면 첫 Day. 루틴에 Day가 없으면 null.
  // routine_days(루틴 소유 테이블)를 읽기 전용으로 조회한다 — 다음 차례 계산은 plan 생성의 본질적 일부.
  nextDay: (userId: string, routineId: string) => Promise<RoutineDayRef | null>;
  // 직전 동일 Day(routineDayId)의 완료 세션에서 운동별 실제 세트 기록. 이력이 없으면 빈 배열.
  lastOverload: (
    userId: string,
    routineId: string,
    routineDayId: string,
  ) => Promise<OverloadRecord[]>;
  // 루틴 내 label로 routine_days.id를 찾는다(계획 확정 시 routineDayId FK를 채우는 용도).
  // 소유 루틴에 그 label이 없으면 null(루틴 수정/삭제로 사라졌을 수 있음 → 호출측이 관대 처리).
  findDayId: (userId: string, routineId: string, label: string) => Promise<string | null>;
  // 계획 상태를 갱신하고 갱신된 레코드를 돌려준다. 없거나 타 유저면 null.
  // 전이 유효성(역전이 금지 등)은 service가 강제하고, 저장소는 순수 갱신만 한다.
  updateStatus: (userId: string, id: string, status: string) => Promise<PlanRecord | null>;
}
