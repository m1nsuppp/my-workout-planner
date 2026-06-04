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

export interface PlanRepository {
  create: (userId: string, plan: NewPlan) => Promise<PlanRecord>;
  findById: (userId: string, id: string) => Promise<PlanRecord | null>;
}
