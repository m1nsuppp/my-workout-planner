# my-workout-planner — 데이터 모델 (D1)

> [스키마 초안](./schemas.md)의 도메인 엔티티를 **Cloudflare D1(SQLite)** 영속 모델로 옮긴다.
> 완전 정규화. DDL은 설계 초안(구현 시 마이그레이션으로 확정).
> 🟡 = 토론 필요 지점.

## 전제

- **주 저장소: D1(SQLite)**. 계획/기록 조회·집계와 "직전 동일 Day 기록" 쿼리에 적합.
- 라이브 세션(운동 *중*)도 별도 저장소 없이 `plans.status='in_progress'`로 표현. (실시간 협업 필요해지면 DO 도입 — 현재 불필요)
- **ID**: ULID 문자열(`TEXT PRIMARY KEY`). 시간순 정렬 가능.
- **인증/인가는 MVP 범위**(간단 로그인). `users` 테이블을 우리가 보유하고, 모든 사용자 소유 데이터는 `user_id` FK로 연결한다. 인증 흐름(OAuth/세션) 상세는 별도 문서에서.
- 무게: `REAL`(kg). 2.5kg 증분은 앱에서 반올림. 🟡 정밀도 이슈 시 정수 그램(`INTEGER`)로 전환 검토.

## ERD (개념)

```
users
  └─< routines ─< routine_days ─< routine_exercises ─< routine_exercise_muscles
  └─< plans ─< plan_exercises ─< planned_sets
                    └─< plan_exercise_muscles

plans.routine_id     → routines.id   (파생)
plans.routine_day_id → routine_days.id (어느 Day, nullable: 루틴 수정/삭제 대비)
```

- `routine` 계열 = **템플릿**(목표 범위만), `plan` 계열 = **인스턴스**(특정 날짜, 구체 수치 + 실제 기록).
- **계획 = 생성 시점 스냅샷**: 루틴이 나중에 수정/삭제돼도 과거 계획은 불변. 그래서 plan 계열은 루틴을 FK로만 매달지 않고 표시에 필요한 값(`routine_day_label`, `plan_exercises.name` 등)을 **복사해 박는다**. FK(`routine_day_id`)는 "현재 구조 안 위치"(다음 차례 계산)용, 복사본은 "그날의 역사적 사실"용 — 분업.

## 테이블

```sql
-- 사용자. 인증 상세(OAuth/세션)는 별도 문서, 여기선 식별·소유권 골격만.
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- ── 루틴(템플릿) ───────────────────────────────
CREATE TABLE routines (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  goal          TEXT NOT NULL,           -- 'hypertrophy' | 'strength' | 'endurance'
  split_type    TEXT NOT NULL,           -- 'full_body' | 'upper_lower' | ...
  days_per_week INTEGER NOT NULL,        -- 목표 빈도(강제 배치 X)
  created_at    TEXT NOT NULL
);

CREATE TABLE routine_days (
  id          TEXT PRIMARY KEY,
  routine_id  TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,             -- "상체 A"
  order_index INTEGER NOT NULL,          -- Day 순서(순서 모델의 핵심)
  UNIQUE (routine_id, order_index)
);

CREATE TABLE routine_exercises (
  id              TEXT PRIMARY KEY,
  routine_day_id  TEXT NOT NULL REFERENCES routine_days(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  target_sets     INTEGER NOT NULL,
  target_rep_min  INTEGER NOT NULL,      -- targetRepRange[0]
  target_rep_max  INTEGER NOT NULL,      -- targetRepRange[1]
  order_index     INTEGER NOT NULL,
  UNIQUE (routine_day_id, order_index)
);

-- MuscleGroup[] 정규화 (junction)
CREATE TABLE routine_exercise_muscles (
  routine_exercise_id TEXT NOT NULL REFERENCES routine_exercises(id) ON DELETE CASCADE,
  muscle_group        TEXT NOT NULL,     -- 'chest' | 'back' | ...
  PRIMARY KEY (routine_exercise_id, muscle_group)
);

-- ── 계획(인스턴스) ─────────────────────────────
CREATE TABLE plans (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  routine_id       TEXT NOT NULL REFERENCES routines(id),
  routine_day_id   TEXT REFERENCES routine_days(id) ON DELETE SET NULL, -- 어느 Day(파생)
  routine_day_label TEXT NOT NULL,       -- 표시용 스냅샷(루틴 수정돼도 불변)
  date             TEXT NOT NULL,        -- ISODate "2026-05-25"
  status           TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|in_progress|completed
  overload_note    TEXT,                 -- LLM 과부하 근거
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_plans_user_date ON plans(user_id, date);          -- 캘린더/오늘 조회
CREATE INDEX idx_plans_day_lookup ON plans(routine_id, routine_day_id, status, date); -- 직전 동일 Day

CREATE TABLE plan_exercises (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  note        TEXT,                       -- 운동 중 교체 등 한 줄 메모
  order_index INTEGER NOT NULL,
  UNIQUE (plan_id, order_index)
);

CREATE TABLE plan_exercise_muscles (
  plan_exercise_id TEXT NOT NULL REFERENCES plan_exercises(id) ON DELETE CASCADE,
  muscle_group     TEXT NOT NULL,
  PRIMARY KEY (plan_exercise_id, muscle_group)
);

-- 계획 세트 = 목표값 + (선택)실제 수행값. actual은 한 세트당 최대 1개라 컬럼으로 흡수.
CREATE TABLE planned_sets (
  id                TEXT PRIMARY KEY,
  plan_exercise_id  TEXT NOT NULL REFERENCES plan_exercises(id) ON DELETE CASCADE,
  order_index       INTEGER NOT NULL,
  target_weight_kg  REAL NOT NULL,
  target_reps       INTEGER NOT NULL,
  -- 수행 기록(SetRecord). 미수행이면 NULL.
  actual_weight_kg  REAL,
  actual_reps       INTEGER,
  actual_rir        INTEGER,
  completed_at      TEXT,
  UNIQUE (plan_exercise_id, order_index)
);
```

## 상태 전이 (plans.status)

```
scheduled ──[운동 시작]──> in_progress ──[운동 종료]──> completed
   │                          │
   │                          └─[이어서 하기]→ in_progress (앱 재진입)
   └─[삭제]──> (행 제거)
```

- `completed`는 종착. "다시 운동하기"는 이 계획을 *수정*하지 않고, 이를 템플릿 삼아 **새 plan**(새 날짜)을 생성한다.
- ✅ **고치는 건 값(actual)이지 상태가 아니다.** `completed` 계획도 `planned_sets.actual_*`는 계획 상세에서 자유 수정 허용(오타 정정). 단 `status`를 `completed → in_progress`로 되돌리는 전이는 금지 → 상태 기계 단순 유지.

## 핵심 쿼리 경로

1. **오늘 카드 / 캘린더** — `idx_plans_user_date`로 `user_id + date(범위)` 조회.
2. **다음 차례 Day** — 해당 루틴의 `completed` plan 중 가장 최근의 `routine_day_id` → routine_days.order_index의 다음 Day.
3. **직전 동일 Day 수행 기록**(과부하 근거) — `idx_plans_day_lookup`로
   `routine_id + routine_day_id + status='completed'` 중 `date` 최댓값 → 그 plan의 `planned_sets.actual_*`.

## 토론 포인트

1. ~~`users`를 모델에 둘지~~ ✅ **보유**(인증은 MVP 범위). 인증 흐름 상세는 별도 문서.
2. ~~무게를 `REAL`(kg) vs `INTEGER`(그램)~~ ✅ **`REAL`(kg)**. 2.5kg 증분·단순 기록엔 충분.
3. ~~`completed` 계획의 기록 정정 허용 여부~~ ✅ **actual 값 자유 수정 허용, status 되돌리기 금지.** (값은 고치되 상태는 종착)
4. ~~`routine_day_label` 스냅샷 병행~~ ✅ **채택.** FK는 현재 위치용, 복사본은 역사적 사실용(분업). `plan_exercises.name`도 동일 원칙.
