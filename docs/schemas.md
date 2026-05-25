# my-workout-planner — 스키마 초안

> [화면 정의](./screens.md)의 LLM 구조화 출력 3종(루틴·계획·코치 변경안)과 그 근거가 되는 도메인 엔티티를 정의한다.
> 표기는 TypeScript 타입 + 주석. 구현 시 Zod 등으로 옮겨 **스키마 강제**(one-pager 리스크 1번)에 사용한다.
> 🟡 = 토론 필요 지점.

## 0. 공통

Zod 스키마를 **단일 출처**로 두고 타입은 `z.infer`로 파생한다.
혼동 위험이 큰 값(`ISODate`/`ISODateTime`, 엔티티별 `*Id`)은 `.brand()`로 브랜딩해, **검증을 통과한 값만** 해당 타입으로 흐르게 한다. (brand는 타입 레벨 전용 — 런타임 값엔 아무것도 안 붙고, `parse`를 거쳐야만 생성 가능)

스키마 값은 `*Schema`, 타입은 동명으로 둔다. (`z.infer`로 파생)

```ts
import { z } from 'zod';

// 날짜/시각 — 둘이 섞이면 버그 직결이라 분리 브랜딩
export const ISODateSchema = z.string().date().brand<'ISODate'>(); // "2026-05-25"
export type ISODate = z.infer<typeof ISODateSchema>;

export const ISODateTimeSchema = z.string().datetime().brand<'ISODateTime'>(); // "2026-05-25T09:00:00Z"
export type ISODateTime = z.infer<typeof ISODateTimeSchema>;

// 엔티티 식별자 — "PlanId 자리에 RoutineId" 같은 실수 차단 (값은 ULID 등)
export const RoutineIdSchema = z.string().brand<'RoutineId'>();
export type RoutineId = z.infer<typeof RoutineIdSchema>;

export const PlanIdSchema = z.string().brand<'PlanId'>();
export type PlanId = z.infer<typeof PlanIdSchema>;

// 근육군 (대체 운동·과부하 판단에 필요한 최소 분류)
export const MuscleGroupSchema = z.enum([
  'chest', 'back', 'shoulders',
  'legs', 'glutes', 'core',
  'biceps', 'triceps',
]);
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;

// 분할 방식
export const SplitTypeSchema = z.enum([
  'full_body', 'upper_lower', 'push_pull_legs', 'bro_split', 'custom',
]);
export type SplitType = z.infer<typeof SplitTypeSchema>;

// 운동 목표 (근비대 / 근력 / 근지구력)
export const GoalSchema = z.enum(['hypertrophy', 'strength', 'endurance']);
export type Goal = z.infer<typeof GoalSchema>;
```

> 아래 1·2장의 엔티티/출력은 가독성을 위해 `interface` 표기로 두지만, 구현 시엔 동일하게 Zod 스키마(`z.object(...)`)로 정의하고 타입을 `z.infer`로 파생한다. `id` 필드 등은 위 브랜딩 타입(`RoutineId`, `PlanId` …)을 참조한다.

---

## 1. 도메인 엔티티 (영속 데이터)

LLM 출력과 별개로, 저장되는 실체. LLM 출력은 이걸 **생성·수정하는 제안**이다.

### Routine — 루틴(템플릿)

```ts
interface Routine {
  id: RoutineId;
  name: string; // "주 4회 상하체 분할"
  goal: Goal;
  splitType: SplitType;
  daysPerWeek: number; // 목표 빈도(권장 알림 근거). 요일 강제 배치엔 쓰지 않음
  // 분할의 각 "날"을 순서로 정의(Day A/B/C…). 요일 고정 아님 → "운동한 날"만 진도가 나감
  days: RoutineDay[];
  createdAt: ISODateTime;
}

interface RoutineDay {
  label: string; // "상체 A", "하체"
  exercises: RoutineExercise[];
}

// 루틴의 운동 = "목표 범위"만 가짐. 구체 수치는 계획에서 확정.
interface RoutineExercise {
  name: string; // "바벨 벤치프레스"
  muscleGroups: MuscleGroup[];
  targetSets: number; // 3
  targetRepRange: [number, number]; // [8, 12]
}
```

> ✅ **순서 모델로 확정.** "월=상체"식 요일 고정이 아니라 Day A/B/C…를 순서대로 소화. 하루 쉬어도 순서가 안 깨지고 "운동한 날"만 진도가 나간다(현장 변수에 강함 = 핵심 가치와 정렬).
> - **다음 차례**: 계획 생성 시 서버가 "이 루틴의 마지막 완료 Day 다음"을 **자동 제시**하고, 사용자가 **다른 Day로 변경 가능**.
> - **과부하 기준**: "직전 동일 Day의 수행(RIR)"을 기준으로 증량 판단 → 빠진 주가 끼어도 안 꼬임.

### Plan — 계획(루틴의 인스턴스, 특정 날짜)

```ts
type PlanStatus = 'scheduled' | 'in_progress' | 'completed';

interface Plan {
  id: PlanId;
  routineId: RoutineId; // 파생된 루틴
  routineDayLabel: string; // 이 계획이 루틴의 어느 "날"인지
  date: ISODate;
  status: PlanStatus;
  exercises: PlanExercise[];
  // 이 계획을 만들 때 LLM이 적용한 과부하 근거 (S5에서 표시)
  overloadNote?: string;
  createdAt: ISODateTime;
}

// 계획의 운동 = 구체 수치 확정 (무게 포함)
interface PlanExercise {
  name: string;
  muscleGroups: MuscleGroup[];
  sets: PlannedSet[];
  // 운동 중 코치가 남긴 사람이 읽을 한 줄 메모. 예: "교체(랫풀다운 → 어시스트 풀업)"
  // 구조적 원본 이력(replacedFrom)은 분석 기능 도입 시 재검토 — MVP는 생략.
  note?: string;
}

interface PlannedSet {
  targetWeightKg: number; // 50
  targetReps: number; // 8
  // 실제 수행 기록 (S7에서 채워짐). 미수행이면 undefined.
  actual?: SetRecord;
}

// 세션 수행 기록 — 점진적 과부하의 데이터 근거
interface SetRecord {
  weightKg: number;
  reps: number;
  rir: number; // Reps In Reserve (남은 반복 수). 0=실패지점, 2=2회 더 가능
  completedAt: ISODateTime;
}
```

> ✅ 운동 *중* 코치가 운동을 교체하면 `PlanExercise`가 치환된다. 구조적 원본 이력은 생략하고, `note?`에 사람이 읽을 한 줄만 남긴다(MVP).

---

## 2. LLM 구조화 출력 스키마

LLM이 자유 텍스트 대신 **이 형태로만** 응답하도록 강제. 화면은 이 구조를 그대로 렌더.

### 2-1. 루틴 생성 (S2)

대화 도중 LLM이 루틴을 제안할 때의 출력.

`phase` 태그로 단계를 명시(discriminated union). phase에 맞는 필드만 채우도록 프롬프트로 강제 → 모순 출력 차단.

```ts
type RoutineProposal =
  | { phase: 'asking'; message: string } // 정보 수집 단계 (추가 질문)
  | { phase: 'proposing'; message: string; routine: RoutineDraft }; // 확정 가능한 루틴 제안. 수정도 새 proposing

// id/createdAt 없는 Routine (확정 시 서버가 부여)
type RoutineDraft = Omit<Routine, 'id' | 'createdAt'>;
```

> 화면: `phase === 'proposing'` 일 때만 "이 루틴으로 확정" 버튼 활성화. "확정 직전 수정"은 별도 단계 없이 `proposing` 반복으로 처리(필요해지면 그때 분리).

### 2-2. 계획 생성 (S5) — 점진적 과부하

루틴 + 날짜 + 이전 수행 기록을 입력받아 그날 계획을 제안.

```ts
// 입력 (서버 → LLM):
//  - 대상 Day(자동 제시된 다음 차례, 또는 사용자가 변경한 Day)
//  - 그 Day 각 운동의 "직전 동일 Day" 수행 기록 요약
interface PlanGenContext {
  routineDayLabel: string; // 이번에 소화할 Day (예: "상체 A")
  overloads: OverloadContext[];
}

interface OverloadContext {
  exerciseName: string;
  lastRecords: SetRecord[]; // 직전 동일 Day 세션의 세트 기록
}

// RoutineProposal과 동일한 phase 패턴으로 통일
type PlanProposal =
  | { phase: 'asking'; message: string } // 정보 수집 (어느 Day? 오늘 컨디션?)
  | { phase: 'proposing'; message: string; planDraft: PlanDraft }; // 확정 가능한 계획 제안

type PlanDraft = Omit<Plan, 'id' | 'status' | 'createdAt'>;
```

> **과부하 규칙(과학적 근거)은 프롬프트에 박는다.** 스키마는 결과만 받음:
> - 직전 세션 RIR이 높았다(쉬웠다) → 다음 계획에서 무게/횟수 ↑ (상향은 *다음 계획에서만*)
> - 이때 `overloadNote`에 근거 명시: "지난 벤치 RIR 2 → 2.5kg 증량"

### 2-3. 운동 중 코치 (S8) — discriminated union

코치 응답은 **대화 메시지 + (선택적) 변경안**. 변경안은 종류별로 구분.

```ts
interface CoachResponse {
  message: string; // "5분만 쉬어볼까요? 그 다음 상태를 알려주세요."
  // 즉시 적용할 변경안. 없으면(대화만) null.
  change: CoachChange | null;
}

// applying(plan을 변형, /coach/apply가 처리) vs advisory(변형 없음, 클라가 처리)
type CoachChange =
  | SubstituteExercise // [applying] 운동 교체 (자리 없음/장비 없음)
  | AdjustLoad         // [applying] 부하 하향 (컨디션 난조)
  | Rest               // [advisory] 휴식 권유 — 타이머만, 영속 변경 없음
  | EndSession;        // [advisory] 조기 종료 — 실제 종료는 PATCH /plans/:id/status로(책임 분리)

interface SubstituteExercise {
  kind: 'substitute';
  targetExerciseName: string; // 교체 대상
  replacement: PlanExercise; // 대체 운동 (동일 근육군 우선). reason을 replacement.note에 박아 흔적 남김
  reason: string;
}

// delta(상대 조정)로 표현 → "하향만"을 스키마 제약으로 강제.
// 상향(↑)은 운동 철학상 금지(다음 계획에서만) → 비율 ≤1, 횟수 delta ≤0.
interface AdjustLoad {
  kind: 'adjust_load';
  targetExerciseName: string;
  weightFactor: number; // 무게 배율. z.number().min(0.5).max(1). 예: 0.8 = 20% 감량 (하한 0.5)
  repsDelta?: number;   // 횟수 증감. z.number().int().max(0). 예: -2
  dropSets?: number;    // 남은 세트 수 줄이기. z.number().int().min(0). 적용 시 ≤ 남은 세트 수
  reason: string;
}
// 적용 규칙(서버 /coach/apply 가드):
//  - 남은(미수행) 세트에만 적용. 이미 완료된 세트의 actual은 불변.
//  - weightFactor 적용 후 2.5kg 단위로 반올림(roundToPlate). 운동별 step은 추후.
//  - parse 단계에서 상향 시도(>1, repsDelta>0)는 reject(throw).
//  - 멱등성 키로 중복 적용 차단(재적용 시 weightFactor 누적 곱 방지).

interface Rest {
  kind: 'rest';
  durationSec: number; // 권장 휴식
  reason: string;
}

interface EndSession {
  kind: 'end_session';
  reason: string;
}
```

> ✅ **"너무 쉬움" 케이스**: 비대칭 규칙상 즉석 증량 없음 → 별도 `kind` 불필요. `change: null` + message로 "오늘은 계획대로, 기록 보고 다음에 올려드릴게요" 처리.

---

## 토론 포인트 모음

1. ~~루틴의 "날"을 요일 고정 vs 순서 중 무엇으로?~~ ✅ **순서 모델** + 다음 차례 자동 제시·변경 가능.
2. ~~`RoutineProposal` 질문/제안 단계를 `routine: null`로만 구분?~~ ✅ **명시적 `phase`**(`asking`/`proposing`) 도입, `PlanProposal`도 통일.
3. ~~코치 `AdjustLoad`를 하향만 허용?~~ ✅ **delta 표현**(`weightFactor≤1`, `repsDelta≤0`)으로 스키마 강제 + 서버 가드. 남은 세트에만, 2.5kg 반올림.
4. ~~운동 교체 시 원본 이력(`replacedFrom`)을 남길까?~~ ✅ **구조적 이력 생략**, `PlanExercise.note?`에 사람이 읽을 한 줄만. (분석 기능 시 재검토)
