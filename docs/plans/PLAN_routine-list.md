# Implementation Plan: 내 루틴 목록 화면 (Tailwind 수직 슬라이스)

**Status**: 🔄 In Progress
**Started**: 2026-05-31
**Last Updated**: 2026-05-31
**Estimated Completion**: 미정

---

**⚠️ CRITICAL**: 각 Phase 완료 시 — 태스크 체크 → Quality Gate 검증 실행 → 날짜 갱신 → 배운 점 기록. **검증 실패 상태로 다음 Phase로 넘어가지 않는다.**

---

## 📋 Overview

### Feature Description

현재 web은 **인증 배관만** 깔려 있고 실제 제품 화면·스타일링 도구가 전무하다. 홈(`/`)은
`<h1>` + 로그인 링크뿐이고, `RoutineService.list()`/`GET /routines`는 api·service 레이어에
존재하지만 이를 소비하는 화면이 없다.

이 계획은 **"내 루틴 목록"** 화면 하나를 수직 슬라이스로 끝까지 구현한다 — 즉 스타일링 토대
(Tailwind v4) · **보호 라우트 가드** · API 연동 · 로딩/빈/에러 UI 상태까지 한 화면에서 관통한다.
첫 보호 화면이 생기므로 인증 가드 패턴이 비로소 정당화된다(그 전엔 쓸 데 없는 추상화).

화면 자체는 `screens.md`의 정식 MVP 화면은 아니지만(거긴 S1 홈이 진입점), 인증·API·UI 전 구간을
최소로 검증하는 슬라이스로 적합하며 이후 **S1 홈에 자연스럽게 폴딩**된다.

### Success Criteria

- [ ] Tailwind v4가 동작하고, 모든 화면이 **420px 고정폭 모바일 컨테이너**(중앙 정렬)에 렌더된다
- [ ] `/routines` 라우트는 **보호됨** — 미로그인 시 진입 자체가 막히고 `/`로 리다이렉트된다
- [ ] 로그인 사용자는 자신의 루틴 목록을 보고, 루틴이 없으면 **빈 상태 안내**를 본다
- [ ] 화면 상태 로직(loading/empty/loaded/error)이 `useRoutines` hook으로 분리되어 fake service로 단위 검증된다
- [ ] 홈에서 "내 루틴"으로 진입하는 동선이 있다
- [ ] 기존 인증 테스트·빌드가 무회귀로 통과한다

---

## 🏗️ Architecture Decisions

| Decision | Rationale | Trade-offs |
| --- | --- | --- |
| **Tailwind v4 (`@tailwindcss/vite`)** | CSS-first 설정(config 파일 불필요), 유틸리티로 화면을 빠르게 적층. react+vite 사실상 표준 | 의존성 2개 추가. 유틸 클래스가 마크업에 섞임(컴포넌트 분리로 완화) |
| **모바일 고정폭 컨테이너(420px)** | `screens.md` 레이아웃 원칙 — 단일 모바일 UI를 데스크톱서도 중앙 고정폭으로 | 데스크톱 전용 레이아웃 포기(의도된 범위 제외) |
| **인증 가드 = router context + `beforeLoad`** | 보호 콘텐츠가 깜빡 노출되기 전 라우트 진입 단계에서 차단. react 트리 밖 라이프사이클이 적합 | authService를 react context + router context 두 곳에 주입(각자 다른 레이어 담당) |
| **화면 상태를 `useRoutines` hook으로 분리** | UI는 렌더만, 상태 로직은 fake service로 입력→출력 단위 검증(테스트 원칙 준수) | hook ↔ 컴포넌트 분리 비용(슬라이스 1개라 부담 적음) |
| **`@testing-library/react` 도입** | hook/컴포넌트의 공개 동작 검증용. 현재 web엔 jsdom만 있음 | dev 의존성 추가 |

---

## 📦 Dependencies

- [ ] 인증 기능 완료 (`me()`·`AuthServiceProvider`·`/auth/me`) — ✅ 이미 존재
- [ ] `RoutineService.list()` + `GET /routines` — ✅ 이미 존재
- [ ] 신규 dev/런타임 의존성: `tailwindcss`, `@tailwindcss/vite`, `@testing-library/react`, `@testing-library/dom`

---

## 🧪 Test Strategy

**TDD 원칙**: 테스트를 먼저 쓰고, 통과시키는 최소 구현을 한다. **단, 스타일/레이아웃·라우터 가드 글루는
유닛테스트 대상이 아니다** — 정직하게 build + Playwright 시각/E2E 검증으로 대체한다(억지 단언 금지).

| Test Type | Coverage Target | Purpose |
| --- | --- | --- |
| **Unit (hook)** | `useRoutines` ≥80% | 화면 상태 기계: loading→loaded/empty/error |
| **Unit (repository)** | 기존 유지 | `RoutineRepository`는 이미 검증됨(재사용) |
| **E2E (Playwright)** | 핵심 흐름 | 미로그인 보호 리다이렉트 / 로그인 후 목록·빈 상태 |
| **Visual (Playwright snapshot)** | 레이아웃 | 420px 컨테이너·Tailwind 적용 확인 |

---

## 🚀 Implementation Phases

### Phase 1: Tailwind v4 셋업 + 모바일 레이아웃 쉘

**Goal**: Tailwind가 동작하고, 모든 라우트가 420px 중앙 고정폭 컨테이너 안에 렌더된다.
**Estimated Time**: 1h
**Status**: ✅ 완료 (2026-05-31)

#### Tasks

**🟢 GREEN (스타일 페이즈 — RED 유닛테스트 없음, 시각 검증)**

- [ ] `tailwindcss`·`@tailwindcss/vite` 설치 (`apps/web`)
- [ ] `vite.config.ts`에 `tailwindcss()` 플러그인 추가 (tanstackRouter→react 순서 유지, tailwind는 병행)
- [ ] `src/app/styles.css` 생성: `@import "tailwindcss";` + `main.tsx`에서 import
- [ ] `__root.tsx`를 모바일 쉘로 교체: 바깥 빈 배경 + 중앙 `max-w-[420px]` 컨테이너 + `<Outlet/>`
- [ ] 홈(`index.tsx`) 마크업을 Tailwind 클래스로 최소 정돈(로그인 링크 = 버튼 형태)

#### Quality Gate

- [ ] `pnpm --filter @workout/web build` 성공
- [ ] tsc·lint 통과
- [ ] Playwright 스냅샷: 홈이 420px 컨테이너에 렌더, Tailwind 클래스 적용 확인
- [ ] 기존 web 테스트 무회귀

**Dependencies**: 없음
**Rollback**: vite.config·styles.css·`__root` 변경 revert (커밋 단위 1개)

---

### Phase 2: 루틴 목록 데이터 레이어 (`useRoutines` hook)

**Goal**: `useRoutineService().list()`를 감싸 화면 상태를 노출하는 hook을, fake service로 단위 검증한다.
**Estimated Time**: 1.5h
**Status**: ✅ 완료 (2026-05-31)

#### Tasks

**🔴 RED: 실패 테스트 먼저**

- [ ] `@testing-library/react`·`@testing-library/dom` 설치
- [ ] `src/routines/use-routines.spec.tsx` 작성 — fake `RoutineService`를 `RoutineServiceProvider`로 주입
  - 초기 `loading`
  - 성공·비어있지 않음 → `loaded` + routines
  - 성공·빈 배열 → `empty`
  - reject(`ApiResponseError`) → `error`

**🟢 GREEN: 최소 구현**

- [ ] `src/routines/use-routines.ts` — `useRoutineService()` + `useState`/`useEffect`로 상태 기계 구현
  - 반환: `{ status: 'loading' | 'empty' | 'loaded' | 'error', routines: Routine[] }`
  - cleanup으로 unmount 후 setState 방지(`index.tsx`의 me 패턴 재사용)

**🔵 REFACTOR**

- [ ] 홈의 `useCurrentUser`와 형태가 3회 반복되면 공통화 검토(지금은 2회 → 그대로 둠)

#### Quality Gate

- [ ] `useRoutines` 테스트 4종 통과, 커버리지 ≥80%
- [ ] tsc·lint 통과
- [ ] 내부 호출 순서·구현 세부 단언 없음(입력→출력만)

**Dependencies**: 없음(Phase 1과 독립 가능하나 순서상 뒤)
**Rollback**: `use-routines.*` 삭제

---

### Phase 3: 화면 + 인증 가드 (`/routines` 보호 라우트)

**Goal**: 보호된 `/routines` 라우트에서 `useRoutines`로 목록을 Tailwind 카드로 렌더한다.
**Estimated Time**: 2h
**Status**: ⏳ Pending

#### Tasks

**🟢 GREEN: 가드 메커니즘**

- [ ] `__root.tsx`를 `createRootRouteWithContext<{ authService: AuthService }>()`로 전환
- [ ] `main.tsx`: `createRouter({ routeTree, context: { authService } })`
- [ ] `src/app/routes/routines.tsx` 생성 — `beforeLoad`에서 `await context.authService.me()`, `null`이면 `throw redirect({ to: '/' })`

**🟢 GREEN: 화면**

- [ ] `routines.tsx` 컴포넌트: `useRoutines()` 분기
  - `loading` → 스켈레톤/“불러오는 중…”
  - `empty` → "아직 루틴이 없어요" + `루틴 만들기`(placeholder 버튼, 동선은 후속)
  - `loaded` → 루틴 카드 리스트(이름·goal·splitType·daysPerWeek·운동 수)
  - `error` → 에러 메시지
- [ ] 루틴 카드 = Tailwind 컴포넌트(`RoutineCard`), `screens.md` S3 요소 요약 반영

#### Quality Gate

- [ ] Playwright E2E: 미로그인 `/routines` 직접 진입 → `/`로 리다이렉트(보호 콘텐츠 미노출)
- [ ] Playwright: 로그인 상태 `/routines` → 목록/빈 상태 정상 렌더
- [ ] tsc·lint·기존 테스트 통과
- [ ] `route-tree.gen.ts` 재생성 반영

**Dependencies**: Phase 1(쉘)·Phase 2(hook)
**Rollback**: `routines.tsx` 삭제 + `__root`/`main` context 전환 revert

---

### Phase 4: 네비 연결 + 통합 회귀

**Goal**: 홈에서 목록으로 가는 동선을 잇고 전체 흐름을 E2E로 굳힌다.
**Estimated Time**: 1h
**Status**: ⏳ Pending

#### Tasks

**🟢 GREEN**

- [ ] 홈(로그인 상태)에 `내 루틴` 진입 링크/버튼 추가(`<Link to="/routines">`)
- [ ] 미로그인 홈에는 노출하지 않음(로그인 후에만)

**✅ 통합 검증**

- [ ] Playwright 전체 흐름: 로그인 → 홈 → 내 루틴 → (0개라) 빈 상태 → 뒤로
- [ ] 미로그인: `/routines` 가드 리다이렉트 재확인
- [ ] `pnpm -r` 기준 tsc·lint·test·build 전부 green
- [ ] 기존 인증/루틴 테스트 무회귀

#### Quality Gate

- [ ] 위 통합 검증 전부 통과
- [ ] 콘솔 에러 = 의도된 401(프로브)·favicon 외 없음

**Dependencies**: Phase 3
**Rollback**: 홈 링크 추가분 revert

---

## ⚠️ Risk Assessment

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| `beforeLoad`의 `me()`가 매 진입 네트워크 호출 | 중 | 저 | MVP 허용. 후속에 router context 캐시 도입 |
| Tailwind v4 플러그인이 tanstackRouter 플러그인과 충돌 | 저 | 중 | 플러그인 순서 검증(스냅샷). 문제 시 PostCSS 경로로 폴백 |
| `@testing-library/react` + jsdom 환경 설정 누락 | 중 | 중 | Phase 2에서 1개 테스트로 환경 먼저 확인 후 확장 |
| 로그인 사용자의 루틴이 0개라 `loaded` 미검증 | 중 | 저 | fake service 단위테스트가 `loaded`를 커버. E2E는 `empty` 검증 |

---

## 🔄 Rollback Strategy

각 Phase는 독립 커밋으로 분리해 Phase 단위 `git revert` 가능. 의존성 추가(Tailwind·testing-library)는
Phase 1·2에 각각 묶어, 되돌릴 때 `package.json`까지 함께 복원된다. 마이그레이션·서버 변경 없음(web 전용).

---

## 📊 Progress Tracking

- [x] Phase 1: Tailwind 셋업 + 모바일 쉘
- [x] Phase 2: `useRoutines` 데이터 레이어
- [ ] Phase 3: 화면 + 인증 가드
- [ ] Phase 4: 네비 연결 + 통합 회귀

---

## 📝 Notes & Learnings

- (작업하며 결정·함정·배운 점 기록)
