# Implementation Plan: OAuth 인증 (Google) + 서버 세션

**Status**: 🔄 In Progress
**Started**: 2026-05-30
**Last Updated**: 2026-05-30
**Estimated Completion**: 미정

---

**⚠️ CRITICAL**: 각 Phase 완료 시 — 태스크 체크 → Quality Gate 검증 실행 → 날짜 갱신 → 배운 점 기록. **검증 실패 상태로 다음 Phase로 넘어가지 않는다.**

---

## 📋 Overview

### Feature Description

현재 인증은 `getUserId`가 dev에서 `x-user-id` 헤더를 신뢰하고 프로덕션에선 무조건 `null`을 반환하는 **placeholder**다. 실제 신원 증명 절차(로그인·세션 발급·검증)가 통째로 없고, 설계 문서(`docs/data-model.md`)에 정의된 `users` 테이블도 코드에는 존재하지 않는다.

이 계획은 **Google OAuth(Authorization Code + PKCE) + D1 서버 세션**을 BFF 패턴으로 구현한다. 토큰은 클라이언트가 직접 만지지 않고, Worker가 code 교환·세션 발급을 전담하며 `sid`를 httpOnly 쿠키로 내려준다. `getUserId`는 헤더 stub에서 **세션 조회**로 교체된다.

### Success Criteria

- [ ] `users`·`sessions` 테이블이 코드(schema.ts)와 마이그레이션에 존재한다
- [ ] Google 로그인 → 콜백 → 세션 쿠키 발급 → 이후 요청 인증의 전 흐름이 동작한다
- [ ] `getUserId`가 세션 기반으로 동작하며 **프로덕션에서도 인증된 사용자를 식별**한다
- [ ] provider는 `OAuthProvider` 인터페이스로 추상화되어 Google 직접 import이 라우트/서비스에 없다
- [ ] 기존 루틴 CRUD 라우트가 세션 인증으로 회귀 없이 통과한다
- [ ] state(CSRF)·세션 만료·무효 세션 처리가 테스트로 검증된다

---

## 🏗️ Architecture Decisions

| Decision | Rationale | Trade-offs |
| --- | --- | --- |
| **서버 세션(D1)** + httpOnly 쿠키 | 이미 D1 인프라 보유, strong consistency로 로그아웃 즉시 무효화 보장. SPA가 토큰을 안 만져 XSS 노출 적음 | 매 요청 세션 조회 1회(무료티어 5M읽기/일 내 충분). KV 엣지 캐시 속도는 포기 |
| **BFF (Worker가 code 교환)** | README의 BFF 원칙과 정렬. 클라이언트에 토큰/시크릿 미노출 | 콜백·리다이렉트 흐름을 서버가 전담 |
| **Authorization Code + PKCE + state** | SPA/공개 클라이언트 표준. PKCE로 code 가로채기, state로 CSRF 방어 | 임시 상태(verifier/state)를 콜백까지 보존할 저장 필요 → 단명 httpOnly 쿠키 사용 |
| **provider 추상화 (`OAuthProvider`)** | Google만 쓰되 GitHub 등 확장 대비. CLAUDE.md "외부 SDK 래핑" 원칙 부합 | 인터페이스 1겹 추가(소비 관점 설계라 비용 낮음) |
| **users를 `(provider, provider_user_id)` 유니크로** | 처음부터 다중 provider 매핑 가능한 형태 | email만 쓰는 현재보다 컬럼 약간 더 |
| **FK 미사용 유지** | 기존 schema.ts 원칙(앱 레벨 무결성, eslint 금지룰)과 일관 | data-model.md SQL의 `REFERENCES`와 표기 불일치 → 코드 원칙(FK 미사용) 따름 |

### 신규/변경 표면 (예상)

```
apps/api/src/
├─ db/schema.ts                 # (변경) users, sessions 테이블 추가
├─ migrations/                  # (신규) drizzle-kit 생성 마이그레이션
├─ env.ts                       # (변경) GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET(secret), OAUTH_REDIRECT_URI
├─ response.ts                  # (변경) Status에 FOUND(302), BAD_REQUEST(400) 추가
├─ auth/
│  ├─ user-repository.ts        # 포트: upsertByProvider, findById
│  ├─ session-repository.ts     # 포트: create, findValid, delete
│  ├─ d1-user-repository.ts     # D1 구현 (+ fake)
│  ├─ d1-session-repository.ts  # D1 구현 (+ fake)
│  ├─ oauth-provider.ts         # OAuthProvider 인터페이스 + FakeOAuthProvider
│  ├─ google-provider.ts        # GoogleProvider 구현 (fetch 래핑)
│  ├─ pkce.ts                   # state/verifier/challenge 생성 (Web Crypto)
│  ├─ service.ts                # authService: 로그인 시작/콜백/로그아웃 오케스트레이션
│  └─ routes.ts                 # /auth/google/start, /callback, /logout
└─ auth.ts                      # (변경) getUserId: 쿠키 sid → 세션 조회
```

---

## 📦 Dependencies

- [ ] Google Cloud Console에서 OAuth 2.0 클라이언트 생성 (client id/secret, redirect URI 등록)
- [ ] `wrangler secret put GOOGLE_CLIENT_SECRET` (로컬은 `.dev.vars`)
- [ ] 쿠키 서명/세션 ID 생성에 Web Crypto 사용 (`nodejs_compat` 이미 설정됨 — 추가 의존성 없이 `crypto.subtle`/`crypto.getRandomValues`)
- [ ] 기존 D1 통합 테스트 인프라(`@cloudflare/vitest-pool-workers`, `applyD1Migrations`) 재사용

---

## 🧪 Test Strategy

**TDD Principle**: 테스트를 먼저 쓰고, 통과시키는 최소 구현을 한다. mock 대신 **fake** 구현 사용(CLAUDE.md 원칙). 테스트는 공개 인터페이스(입력→출력)만 검증.

| Test Type | Coverage Target | Purpose |
| --- | --- | --- |
| **Unit (provider/pkce/service)** | ≥80% (핵심 ≥90%) | provider 추상화, PKCE/state 생성, 세션 발급/검증 규칙 |
| **Integration (D1 repository)** | 핵심 경로 | user upsert, 세션 생성/조회/만료/폐기 — 실제 D1(pool-workers) |
| **Route (auth + 회귀)** | 핵심 흐름 | start 리다이렉트, callback 세션 발급, logout 폐기, state 불일치 차단, 기존 루틴 라우트 회귀 |

**Validation Commands** (전 Phase 공통):

```bash
pnpm --filter api test:coverage
pnpm --filter api lint
pnpm --filter api typecheck
```

---

## 🚀 Implementation Phases

### Phase 1: 데이터 골격 (users · sessions + D1 리포지토리)

**Goal**: `users`·`sessions` 테이블, 마이그레이션, 그리고 두 리포지토리(포트 + D1 구현 + fake)가 동작한다.
**Estimated Time**: 2–3 hours
**Status**: ✅ Done (커밋 9eac902) — tsc·lint 통과, test 33/33. fake repo는 소비처가 생기는 Phase 3에서 추가.

#### Tasks

**🔴 RED: 실패 테스트 먼저**

- [ ] user repository 통합 테스트
  - File: `apps/api/src/auth/d1-user-repository.spec.ts`
  - 케이스: 신규 `upsertByProvider`로 user 생성 / 동일 `(provider, providerUserId)` 재호출 시 같은 user 반환(중복 생성 없음) / `findById` 존재·부재
- [ ] session repository 통합 테스트
  - File: `apps/api/src/auth/d1-session-repository.spec.ts`
  - 케이스: `create` 후 `findValid`로 조회 / 만료(`expiresAt` 과거) 세션은 `findValid`가 null / `delete` 후 조회 null / 타 sid 격리

**🟢 GREEN: 통과 최소 구현**

- [ ] `schema.ts`에 `users`(id, provider, provider_user_id, email, created_at; `unique(provider, provider_user_id)`)·`sessions`(id, user_id, expires_at, created_at) 추가
- [ ] `pnpm --filter api drizzle:generate`로 마이그레이션 생성
- [ ] `user-repository.ts`/`session-repository.ts` 포트 인터페이스 + `d1-*` 구현 + 각 fake
  - 시간 의존(만료)은 주입 가능한 `now`로 — 테스트가 시계를 제어

**🔵 REFACTOR**

- [ ] 기존 `routines/d1-repository.ts` 패턴과 네이밍·구조 정렬, 중복 제거

#### Quality Gate ✋

> ⚠️ STOP: 아래 전부 통과 전 다음 Phase 금지

- [ ] TDD: Red→Green→Refactor 준수
- [ ] Build: typecheck 통과
- [ ] Tests: 전부 통과, 커버리지 목표 충족
- [ ] Quality: lint·format 통과
- [ ] Manual: 마이그레이션이 로컬 D1에 적용됨

---

### Phase 2: Provider 추상화 (OAuthProvider + GoogleProvider + PKCE)

**Goal**: 라우트가 Google 세부를 모른 채 의존할 `OAuthProvider` 인터페이스와 Google 구현, state/PKCE 유틸이 동작한다.
**Estimated Time**: 2–3 hours
**Status**: ✅ Done — tsc·lint clean, test 42/42. PKCE는 RFC 7636 테스트 벡터로 검증. id_token은 TLS 직수신이라 서명검증 생략(payload 디코드).

#### Tasks

**🔴 RED**

- [ ] PKCE/state 유닛 테스트
  - File: `apps/api/src/auth/pkce.spec.ts`
  - 케이스: verifier→challenge(S256) 변환이 RFC 7636 형식 / state·verifier가 충분한 엔트로피의 URL-safe 문자열
- [ ] OAuthProvider 계약 테스트 (fake로)
  - File: `apps/api/src/auth/oauth-provider.spec.ts`
  - 케이스: `authorizeUrl(state, challenge)`에 client_id·redirect_uri·state·code_challenge·scope 포함 / `exchange(code, verifier)`가 `{ email, providerUserId }` 반환
- [ ] GoogleProvider 단위 테스트 (fetch는 fake로 주입)
  - File: `apps/api/src/auth/google-provider.spec.ts`
  - 케이스: 토큰 엔드포인트에 code·verifier 전송 / id_token(또는 userinfo) → email·sub 매핑 / 교환 실패 시 throw(버그 숨기지 않음)

**🟢 GREEN**

- [ ] `oauth-provider.ts`: `OAuthProvider` 인터페이스 + `FakeOAuthProvider`(code↔email 매핑 사전)
- [ ] `pkce.ts`: Web Crypto로 state/verifier/challenge 생성
- [ ] `google-provider.ts`: authorize URL 구성 + 토큰 교환(`fetch` 주입 가능하게), Google 응답 → 도메인 매핑. 직접 import은 이 파일에만 가둠

**🔵 REFACTOR**

- [ ] 매직 문자열(scope, 엔드포인트 URL) 상수화, 네이밍 정리

#### Quality Gate ✋

- [ ] TDD 준수 / typecheck / 테스트+커버리지 / lint·format
- [ ] Manual: `authorizeUrl` 결과를 눈으로 확인(필수 쿼리 파라미터 존재)

---

### Phase 3: 인증 서비스 + /auth 라우트

**Goal**: `/auth/google/start`·`/callback`·`/logout`이 동작하고, state CSRF 검증과 세션 쿠키 발급/폐기가 이뤄진다.
**Estimated Time**: 3–4 hours
**Status**: ⏳ Pending

#### Tasks

**🔴 RED**

- [ ] authService 유닛 테스트 (fake provider + fake repo)
  - File: `apps/api/src/auth/service.spec.ts`
  - 케이스: `begin()`가 state·verifier·authorizeUrl 생성 / `complete(code, verifier)`가 user upsert + 세션 생성 후 sid 반환 / `logout(sid)`가 세션 폐기
- [ ] auth 라우트 테스트 (fake provider 주입)
  - File: `apps/api/src/auth/routes.spec.ts`
  - 케이스:
    - `start` → 302 리다이렉트 + state·verifier가 단명 httpOnly 쿠키로 설정 + Location이 authorizeUrl
    - `callback` 정상 → 세션 sid를 httpOnly·Secure·SameSite 쿠키로 설정 + 앱으로 리다이렉트
    - `callback` state 불일치 → 400(쿠키 state ≠ 쿼리 state, CSRF 차단)
    - `logout` → 세션 폐기 + 쿠키 제거(Max-Age=0)

**🟢 GREEN**

- [ ] `response.ts`: `Status`에 `FOUND: 302`, `BAD_REQUEST: 400` 추가
- [ ] `env.ts`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI` 추가
- [ ] `service.ts`: provider + user/session 리포지토리 조합 오케스트레이션
- [ ] `routes.ts`: 세 엔드포인트 + 쿠키 읽기/쓰기(Hono cookie 헬퍼는 경계에서만)
- [ ] `index.ts`/`app.ts`에 auth 라우트 등록 + deps 주입(실 provider/리포지토리 ↔ 테스트 fake)

**🔵 REFACTOR**

- [ ] 쿠키 속성(Secure/SameSite/Path/Max-Age) 구성 한 곳으로 모음, 중복 제거

#### Quality Gate ✋

- [ ] TDD 준수 / typecheck / 테스트+커버리지 / lint·format
- [ ] Manual: 쿠키 속성(httpOnly·Secure·SameSite)·만료가 의도대로

---

### Phase 4: getUserId 세션 조회로 교체 + 기존 라우트 회귀

**Goal**: `auth.ts`가 세션 기반으로 동작하고, 기존 루틴 CRUD가 세션 인증으로 회귀 없이 통과한다. 프로덕션에서 실제 인증이 동작한다.
**Estimated Time**: 2 hours
**Status**: ⏳ Pending

#### Tasks

**🔴 RED**

- [ ] `getUserId` 테스트 (fake session repo)
  - File: `apps/api/src/auth.spec.ts`
  - 케이스: 유효 sid 쿠키 → userId / 만료·무효·없는 sid → null / **프로덕션 환경에서도 유효 세션이면 userId 반환**(기존 무조건 null 제거)
- [ ] 루틴 라우트 회귀 테스트 갱신
  - File: `apps/api/src/routines/routes.spec.ts`
  - 기존 `x-user-id` 헤더 주입을 **세션 쿠키 기반 인증 헬퍼**로 교체, 미인증 시 401 유지

**🟢 GREEN**

- [ ] `auth.ts`: 쿠키 `sid` → `sessionRepository.findValid` → userId. 헤더 stub 제거
  - dev 헤더 stub은 제거(이번 결정). 테스트는 세션 픽스처로 인증
- [ ] 라우트가 세션 리포지토리에 접근하도록 deps 배선 정리

**🔵 REFACTOR**

- [ ] 인증 게이트(미인증 401) 반복을 라우트 공통 헬퍼/미들웨어로 추출 — **3회 이상 반복 확인 시에만**(현재 루틴 3개 + 추후). 그 전엔 그대로 둠

#### Quality Gate ✋

- [ ] TDD 준수 / typecheck / 전체 테스트 통과(회귀 없음) / lint·format
- [ ] Manual: `wrangler dev`로 start→callback→루틴 조회 전 흐름 1회 수동 확인(실 Google 또는 fake)
- [ ] README의 인증 placeholder 서술 및 `docs/data-model.md`의 users 표기 현행화

---

## ⚠️ Risk Assessment

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Google 토큰 교환 응답 형식/scope 오해 | Med | Med | id_token 디코드 vs userinfo 호출 중 단순한 쪽 선택, 실패 시 throw로 표면화. 통합은 fetch fake로 고정 |
| 콜백까지 state/verifier 보존 방식(쿠키) 누락 | Med | High | 단명 httpOnly 쿠키로 보존 + state 불일치 400 테스트로 강제 |
| 세션 만료/시계 테스트 불안정 | Low | Med | `now` 주입으로 시계 제어, 실시간 의존 제거 |
| 프로덕션 secret 미설정으로 콜백 실패 | Med | Med | Dependencies 체크리스트 + Phase 4 수동 검증 단계 |
| Workers CPU 10ms — 세션 조회 추가 | Low | Low | D1 단건 인덱스 조회, 무료티어 내. 영향 미미 |
| 쿠키 SameSite로 OAuth 리다이렉트 깨짐 | Low | Med | 세션 쿠키 `SameSite=Lax`(top-level 네비게이션 허용), 검증 |

---

## 🔄 Rollback Strategy

### Phase 1 Rollback
- `schema.ts`의 users/sessions 추가분 revert, 신규 마이그레이션 파일 삭제 + `_journal.json` 되돌림, `auth/*-repository*` 삭제

### Phase 2 Rollback
- `auth/oauth-provider.ts`·`google-provider.ts`·`pkce.ts` 및 테스트 삭제

### Phase 3 Rollback
- `auth/service.ts`·`routes.ts` 삭제, `index.ts`/`app.ts` 라우트 등록 revert, `env.ts`/`response.ts` 추가분 revert

### Phase 4 Rollback
- `auth.ts`를 헤더 stub 버전으로 git revert, 루틴 라우트 테스트 회귀분 되돌림. 세션 테이블은 유지 가능(미사용 무해)

---

## 📊 Progress Tracking

| Phase | Estimated | Actual | Status |
| --- | --- | --- | --- |
| Phase 1: 데이터 골격 | 2–3h | - | ⏳ |
| Phase 2: Provider 추상화 | 2–3h | - | ⏳ |
| Phase 3: 인증 라우트 | 3–4h | - | ⏳ |
| Phase 4: getUserId 교체 | 2h | - | ⏳ |

---

## 📝 Notes & Learnings

- **결정**: provider는 Google만 사용하되 `OAuthProvider`로 처음부터 추상화(사용자 요청). users는 `(provider, provider_user_id)` 유니크로 다중 provider 대비.
- **결정**: 세션은 D1 서버 세션 + httpOnly 쿠키. KV 아님(즉시 무효화 보장 우선).
- **결정**: dev `x-user-id` 헤더 stub은 Phase 4에서 제거(세션 픽스처로 대체).
- **범위 밖(후속 계획)**: `apps/web` 프론트 로그인 연동(로그인 버튼, 401 처리, `/me` 표시). web 앱 스캐폴드 후 별도 `PLAN_web-auth.md`로 진행.
- **후속 검토**: `/auth/me`(현재 사용자 조회) 엔드포인트 — web 연동 시점에 contracts DTO와 함께 추가할지 결정.

---

## ✅ Final Checklist

- [ ] 전 Phase Quality Gate 통과
- [ ] start→callback→인증된 요청 전 흐름 통합 확인
- [ ] README·data-model 문서 현행화(인증 placeholder 서술 제거)
- [ ] 보안 리뷰: 쿠키 속성, state CSRF, 세션 만료/폐기, secret 비노출
