# my-workout-planner — API 설계 (Worker)

> [화면 정의](./screens.md) · [스키마](./schemas.md) · [데이터 모델](./data-model.md)을 잇는 HTTP API 초안.
> Cloudflare Worker(Hono). 응답 바디는 스키마 초안의 타입을 따른다.
> 🟡 = 토론 필요 지점.

## 전제

- **인증**: 흐름 상세는 별도 문서. 여기선 모든 엔드포인트가 세션에서 `userId`를 얻는다고 전제(요청 바디에 안 받음 — 소유권 위조 방지).
- **LLM 호출 경계**: 프로바이더는 **OpenRouter**(`@openrouter/agent`의 `callModel`, 모델 ID 예: `anthropic/claude-...`). SDK를 직접 쓰지 않고 `Llm` 인터페이스로 래핑(CLAUDE.md 원칙). 구조화 출력은 **tool calling**으로 받고(`tool({ inputSchema: zodSchema })`) Zod로 검증(실패 시 throw → 화면 안 깨짐, 리스크 1번).
- **스트리밍**: 대화 응답은 (나)안 — `message`는 토큰 스트리밍, 구조화 페이로드는 완성·검증 후 마지막에 전송. SDK의 동시 소비자 패턴(`getTextStream()` + `getResponse()`)으로 한 호출에서 둘 다 얻음. 그래서 `Llm`은 스트림 + 최종 객체를 함께 노출:

  ```ts
  interface Llm {
    proposeRoutine(history: ChatMessage[]): ProposalStream<RoutineProposal>;
    proposePlan(input: PlanGenContext, history: ChatMessage[]): ProposalStream<PlanProposal>;
    coach(session: LiveSessionView, history: ChatMessage[]): ProposalStream<CoachResponse>;
  }
  interface ProposalStream<T> {
    textDeltas: AsyncIterable<string>; // message 토큰
    result: Promise<T>;                // 완성·Zod 검증된 구조화 출력
  }
  ```

- **클라 전송**: `fetch` + ReadableStream(POST·바디·인증 헤더 가능) 위에 **SSE 프레이밍**(`event: delta` / `event: result`)으로 토큰과 최종 객체 구분. 서버는 Hono `streamSSE()`. 자동 재연결은 MVP 비도입(짧은 상호작용).
- **대화형은 "제안"과 "확정/적용"을 분리**: LLM 제안(읽기, 멱등) ↔ 영속 변경(쓰기)을 다른 엔드포인트로. 화면의 `proposing → 확정` 흐름과 일치.
- **확정은 저장이지 재생성이 아니다**: `POST /routines`·`POST /plans`는 LLM을 **재호출하지 않는다**(비결정성·비용·"본 것과 다름" 방지). 대신 받은 draft를 **서버 재검증**: Zod 재파싱 + 소유권(`routineId` 등 실재) + 정합성(`routineDayLabel`/`date`). 계획엔 코치 같은 비대칭 규칙(하향만)이 없으므로 상향(과부하) 허용.

## 엔드포인트

### 루틴 (S2 대화 / S3 상세)

| 메서드 | 경로 | 설명 | 요청 → 응답 |
|---|---|---|---|
| POST | `/routines/chat` | 대화 한 턴 → 루틴 제안 | `{ history }` → **SSE**: `delta`×N + `result`=`RoutineProposal` |
| POST | `/routines` | 제안된 루틴 확정(영속) | `RoutineDraft` → `Routine` |
| GET | `/routines` | 내 루틴 목록 | → `Routine[]` |
| GET | `/routines/:id` | 루틴 상세 | → `Routine` |

### 계획 (S5 대화 / S6 상세 / S4 캘린더)

| 메서드 | 경로 | 설명 | 요청 → 응답 |
|---|---|---|---|
| GET | `/plans?from=&to=` | 기간 내 계획(캘린더·오늘 카드) | → `PlanSummary[]` |
| GET | `/routines/:id/next-day` | 다음 차례 Day 제안 | → `{ routineDayId, label }` |
| POST | `/plans/chat` | 대화 한 턴 → 계획 제안(과부하) | `{ routineId, routineDayLabel, date, history }` → **SSE**: `delta`×N + `result`=`PlanProposal` |
| POST | `/plans` | 제안된 계획 확정(영속) | `PlanDraft` → `Plan` |
| GET | `/plans/:id` | 계획 상세 | → `Plan` |
| PATCH | `/plans/:id/status` | 상태 전이(시작/종료) | `{ status }` → `Plan` |

> `next-day`: 데이터 모델의 "직전 완료 Day의 다음 order_index" 계산. 서버가 자동 제시, 사용자가 다른 Day 고르면 `/plans/chat` 요청의 `routineDayLabel`로 덮어씀.
> `/plans/chat`은 클라가 식별자(`routineId`/`routineDayLabel`/`date`)만 보내고, 과부하 기록(`OverloadContext`)은 **서버가 DB에서 조립**한다(계약에 노출 안 함).
> `status` 전이는 `scheduled→in_progress→completed`만 허용. 역전이(특히 `completed→`) reject.

### 운동 실행 / 코치 (S7 / S8)

| 메서드 | 경로 | 설명 | 요청 → 응답 |
|---|---|---|---|
| PATCH | `/sets/:id` | 세트 actual 기록·정정 | `{ weightKg, reps, rir }` → `PlannedSet` |
| POST | `/plans/:id/coach` | 코치에게 묻기(제안만) | `{ history }` → **SSE**: `delta`×N + `result`=`CoachResponse` |
| POST | `/plans/:id/coach/apply` | 코치 변경안 적용(영속) | `{ change: ApplyableChange, idempotencyKey }` → `Plan` |

> **코치 적용 흐름**: `coach`는 `CoachResponse`(message + change|null)만 반환(영속 변경 없음). 사용자가 S8에서 `적용`을 누르면 `coach/apply`가 변형.
>
> **적용 가능 변경(applying) vs 권유(advisory)** — `CoachChange`를 둘로 나눈다:
> - **applying** (`substitute`, `adjust_load`): `coach/apply`가 진행 중 plan을 실제로 변형.
> - **advisory** (`rest`, `end_session`): plan을 변형하지 않음. 클라가 처리 — `rest`는 타이머만, `end_session`은 **`PATCH /plans/:id/status`(→completed)로 보냄**. 상태 변경 책임은 status 엔드포인트 한 곳으로 모은다(coach/apply는 status를 안 건드림).
>
> **신뢰 경계 = 서버 재검증(A안).** 캐시/changeId(B안)는 생략. 위협은 "남의 데이터"가 아니라 자기 데이터이므로, *적용 결과가 항상 규칙 내*임만 보장하면 충분. `coach/apply`가 강제하는 가드:
> 1. Zod 재파싱 — `adjust_load`의 `weightFactor ∈ [0.5, 1]`, `repsDelta ≤ 0` (상향 차단)
> 2. `targetExerciseName`이 그 plan에 실재
> 3. `substitute.replacement`의 근육군이 원본과 합치(동일 근육군 우선)
> 4. plan 소유권(userId) + 상태 `in_progress` 확인
> 5. **멱등성**: `idempotencyKey`로 중복 적용 차단(delta 재적용으로 `0.8×0.8` 되는 사고 방지) 🔴
> 6. **완료 세트 보호**: `actual` 있는 세트엔 적용 불가, 남은 세트에만 🔴
> 7. `dropSets ≤ 남은 세트 수`
>
> `actual` 정정은 `completed` 계획에도 허용(데이터 모델 결정), `status` 되돌리기는 불가.

## 타입의 거처

- **계약(`@workout/contracts`)**: 경계로 오가는 것 — `PlanSummary`, `ChatMessage`, 각 `*RequestDto`/`*ResponseDto`/`*ResultDto`, 봉투, 값 타입.
- **서버 내부(`apps/api`)**: 클라가 몰라도 되는 것 — `PlanGenContext`/`OverloadContext`(과부하 기록을 DB에서 조립), `LiveSessionView`(코치에 넘길 세션 스냅샷). 계약에 노출하지 않는다.

```ts
// 서버 내부 — 코치에 넘길 현재 세션 스냅샷 (LLM 컨텍스트)
interface LiveSessionView {
  planId: PlanId;
  exercises: PlanExercise[]; // 목표 + 지금까지의 actual
}
```

## 응답 규약 (envelope)

모든 응답을 **전부 봉투(full envelope)** 로 감싼다. 클라는 항상 `ok`부터 분기.

```ts
interface ApiSuccess<T> { ok: true;  data: T; }
interface ApiFailure    { ok: false; error: { code: string; message: string; details?: unknown }; }
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
```

- `code` = 기계 분기용 안정 코드, `message` = 사람용(화면 노출 가능), `details` = Zod issues 등 필드별 부가정보.

### status 매핑

| 상황 | status | code |
|---|---|---|
| 스키마/내용 검증 실패 | 422 | `VALIDATION_FAILED` |
| 잘못된 요청(형식) | 400 | `BAD_REQUEST` |
| 미인증 | 401 | `UNAUTHENTICATED` |
| 남의/없는 리소스 | 404 | `NOT_FOUND` |
| 상태 역전이(completed→ 등) | 409 | `INVALID_STATE_TRANSITION` |
| 멱등성 충돌 | 409 | `IDEMPOTENCY_CONFLICT` |
| LLM 실패/형식 깨짐 | 502 | `LLM_UNAVAILABLE` / `LLM_MALFORMED` |

- **422 분리**: 형식은 맞지만 내용이 규칙 위반인 경우를 400과 구분.
- **404 존재 숨김**: 남의 리소스는 403 대신 404(ID 추측 공격 완화).

### 스트리밍 중 에러

SSE는 이미 200 헤더가 나간 뒤라 status로 못 알린다. 스트림 안에 에러 이벤트로 전달:

```
event: error
data: { "code": "LLM_MALFORMED", "message": "..." }
```

클라가 `event: result` 대신 `event: error`를 받으면 실패 처리(`data`는 봉투의 `error` 객체와 동일 형태).

## 토론 포인트

1. ~~대화 응답 방식~~ ✅ **스트리밍 채택((나)안)**: message 토큰 스트리밍 + 구조화는 검증 후 마지막에. 전송은 fetch+ReadableStream에 SSE 프레이밍, 서버 Hono `streamSSE()`. 프로바이더 OpenRouter.
2. ~~코치 적용 신뢰 경계~~ ✅ **서버 재검증(A안)** + 멱등성·완료세트 보호 등 가드 7종. advisory(`rest`/`end_session`)는 비적용, `end_session`은 status 엔드포인트로(책임 분리).
3. ~~계획 확정 시 LLM 재호출 여부~~ ✅ **재호출 없음 + 서버 재검증.** 확정은 저장이지 재생성이 아님(Zod·소유권·정합성).
4. ~~에러 규약~~ ✅ **전부 봉투 + status 매핑 + 스트림 `event: error`.** "응답 규약" 절 참고.
