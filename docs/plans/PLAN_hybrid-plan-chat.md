# PLAN: 계획 생성 — 하이브리드 카드 대화

## 개요

"계획 만들기" 대화가 망가진 원인은 두 가지였다.

1. **grounding 부재** — `POST /api/plans/chat`가 LLM에 Day의 운동 종목 템플릿(`routine_exercises`)을
   안 실어서, 모델이 운동을 통째로 지어냄("난 저런 운동 넣지도 않았는데").
2. **자유 텍스트 핑퐁** — 닫힌 질문(컨디션)까지 전부 문장 왕복 + Day 변경 요청에 모델이 끌려가
   근거 없는 환각("조회할 권한이 없습니다").

해결: **구조화된 초안 카드 + 그 위에 얹는 자유 대화**(하이브리드). 진입 즉시 Day 템플릿 기반
시드 초안 카드가 채워지고, 사용자는 세트별로 직접 편집하거나 대화로 조정한다. 컨디션 같은 닫힌
질문은 칩 버튼으로 받는다.

근거: PRD "30초 안에 시작", "RIR 숫자 대신 여유있었다/적당했다/힘들었다", 일지의 구조화된 테이블.

## 설계 결정

- **always-draft 프로토콜**: `asking|proposing` 판별 유니온 폐기 → `{message, planDraft}` 단일형.
  카드는 항상 채워져 있고, message는 코치 코멘트/질문. 확정 버튼 상시 노출.
- **시드 초안은 결정적**(LLM 없음): Day 템플릿 + 직전 과부하 무게 carry. 첫 수행은 무게 0(빈칸).
- **대화는 카드를 수정**: chat 요청에 현재 draft를 실어 보냄 → 모델이 수정본 반환.
- **편집 단위**: 세트별 개별(무게·횟수). 백오프/드롭세트 표현 가능.
- **컨디션**: 칩 버튼이 정해진 문자열을 send → 백엔드 변경 없음.
- Day 변경은 챗이 아니라 이전 화면에서. 프롬프트에 "권한 변명 금지, Day 고정" 경계 추가.

## Phase 1 — 백엔드 grounding (버그1)

**목표**: Day 운동 템플릿이 chat 컨텍스트·시스템 프롬프트에 실린다.

- [ ] `plans/repository.ts`: `DayTemplateExercise` 타입 + `dayTemplate(userId, routineId, label)` 포트
- [ ] `plans/d1-repository.ts`: `dayTemplate` 구현(routine_exercises + muscles 조회)
- [ ] `plans/d1-repository.spec.ts`: dayTemplate 테스트(존재/없음/타유저)
- [ ] `plans/service.ts`: `templateFor` 추가
- [ ] `plans/service.spec.ts`: fake repo에 dayTemplate 추가 + templateFor 테스트
- [ ] `plans/chat-service.ts`: `PlanChatContext.template` 추가, `formatTemplate` + 경계 문구
- [ ] `plans/chat-service.spec.ts`: 템플릿 프롬프트 주입 테스트, context에 template 추가
- [ ] `plans/routes.ts`: chat 라우트에서 template + overload 조립
- [ ] `plans/routes-fixtures.ts`: fake planService에 templateFor 추가

**품질 게이트**: `pnpm --filter @workout/api test` 그린, 프롬프트에 종목명·목표 실림.

## Phase 2 — 구조화 프로토콜 전환 (always-draft)

**목표**: chat이 항상 채워진 draft를 반환하고, 현재 draft를 입력으로 받는다.

- [ ] `contracts/plan.ts`: `PlanProposalSchema` → `z.object({message, planDraft})`
- [ ] `contracts/dto.ts`: `PlanChatRequestDto`에 `draft: PlanDraftSchema` 추가
- [ ] `plans/chat-service.ts`: `LlmPlanProposalSchema` 단일형, reply가 draft 입력받아 프롬프트에 실음
- [ ] `plans/routes.ts`: draft 전달
- [ ] `plans/chat-service.spec.ts`: always-draft 반환 검증
- [ ] web `plans/repository.ts`/`use-plan-chat.ts`: `PlanProposal`/`proposal` 타입 갱신

**품질 게이트**: contracts/api/web 타입체크, api 테스트 그린.

## Phase 3 — 시드 초안 엔드포인트 (결정적)

**목표**: 진입 시 LLM 없이 즉시 채워진 초안.

- [ ] `plans/repository.ts`/`d1-repository.ts`: 시드는 dayTemplate + lastOverload 조합으로 service에서 계산(저장소 추가 없이 재사용)
- [ ] `plans/service.ts`: `seedDraft(userId, routineId, label, date)` — 템플릿 × targetSets, 무게=직전 carry ?? 0, 횟수=repRange 하한
- [ ] `plans/service.spec.ts`: seedDraft 테스트(첫수행 0 / carry)
- [ ] `contracts/dto.ts`: `PlanDraftResponseDto`
- [ ] `plans/routes.ts`: `GET /api/routines/:id/plan-draft?day&date`
- [ ] `plans/routes.spec.ts`: 엔드포인트 테스트
- [ ] web `plans/repository.ts`/`create-repository.ts`/`service.ts`/`queries.ts`: `planDraft` 추가

**품질 게이트**: 첫 진입 초안이 Day 종목으로 채워짐, 테스트 그린.

## Phase 4 — 웹 하이브리드 카드 UI

**목표**: 편집 가능한 카드 + 칩 + 대화 갱신 + 확정.

- [ ] `plans/use-plan-chat.ts`: 시드 draft 로드, draft 상태 + 세트 편집 액션, send가 현재 draft 동봉
- [ ] `app/routes/plans_.new.tsx`: 편집 카드(세트별 number input), 컨디션 칩, 대화, 확정
- [ ] `plans/use-plan-chat.spec.tsx` / `app/routes/plans_.new.spec.tsx`: 통합 테스트
- [ ] 수동 확인(`/run` 또는 dev 서버)

**품질 게이트**: web 테스트 그린, 스샷 시나리오(swap 핑퐁/환각) 재현 불가.

## 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| 프로토콜 전환이 web을 Phase 4까지 깨뜨림 | 중 | Phase별 타입체크로 컴파일 그린 유지, e2e는 Phase 4에서 |
| 첫수행 무게 0이 확정돼 저장 | 저 | 카드에서 사용자가 채우도록 UX, 0도 스키마상 유효 |
| LLM이 draft의 종목을 임의 변경 | 중 | 프롬프트 경계 + 서버는 식별필드만 주입(종목은 모델 책임이나 템플릿 grounding으로 억제) |

## 롤백
각 Phase는 독립 커밋. 문제 시 해당 커밋 revert. DB 마이그레이션 변경 없음(읽기만 추가).
