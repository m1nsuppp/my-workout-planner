// 루틴 저장소 포트. 사용하는 쪽(라우트 핸들러) 관점에서 설계한다.
// api 내부 도메인 타입(NewRoutine/RoutineRecord)을 쓰고, 계약 DTO는 경계(라우트)에서만 매핑한다.

export interface NewRoutineExercise {
  name: string;
  muscleGroups: string[];
  targetSets: number;
  targetRepRange: [number, number];
}

export interface NewRoutineDay {
  label: string;
  exercises: NewRoutineExercise[];
}

export interface NewRoutine {
  name: string;
  goal: string;
  splitType: string;
  daysPerWeek: number;
  days: NewRoutineDay[];
}

export interface RoutineRecord extends NewRoutine {
  id: string;
  createdAt: string;
}

export interface RoutineRepository {
  create: (userId: string, routine: NewRoutine) => Promise<RoutineRecord>;
  list: (userId: string) => Promise<RoutineRecord[]>;
  findById: (userId: string, id: string) => Promise<RoutineRecord | null>;
}
