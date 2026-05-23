# my-workout-planner

LLM 기반 운동 루틴 추천 웹 애플리케이션.

프론트엔드와 백엔드를 한 저장소에 co-locate 한 monorepo이며, zod 스키마·타입·API 클라이언트를 `packages/shared`에 두고 양쪽에서 공유한다.

## 기술 스택

| 레이어     | 선택                     | 비고                                            |
| ---------- | ------------------------ | ----------------------------------------------- |
| 모노레포   | pnpm workspaces          | JIT(소스 직접 소비) 방식으로 공유 패키지 import |
| 프론트엔드 | React + Vite             | Cloudflare Pages / Static Assets 배포           |
| 백엔드     | Hono                     | Cloudflare Workers 배포                         |
| DB / ORM   | D1 (SQLite) + Drizzle    | `drizzle-zod`로 스키마 → zod 연동               |
| 공유       | zod + Hono RPC           | 검증·타입·API 클라이언트 end-to-end 공유        |
| LLM        | OpenRouter (OpenAI 호환) | Worker가 프록시(BFF), 키는 Worker Secret        |

## 구조

```
my-workout-planner/
├─ apps/
│  ├─ web/        # React + Vite (프론트엔드)
│  └─ api/        # Hono (백엔드, Cloudflare Workers)
├─ packages/
│  └─ shared/     # zod 스키마 + z.infer 타입 + Hono RPC 클라이언트 타입
├─ pnpm-workspace.yaml
└─ package.json
```

### 타입 흐름

`packages/shared`의 zod 스키마를 단일 소스로 삼아:

1. Hono의 `zValidator`가 요청 검증에 사용
2. `z.infer`로 추론된 타입을 프론트·백 양쪽이 공유
3. Hono RPC(`hc<AppType>()`)로 프론트가 API 클라이언트 타입을 자동 추론

## 아키텍처 결정 사항

- **Edge 배포(Cloudflare Workers)**: 콜드스타트 사실상 0, 개인용 규모에서 무료 티어로 운영 가능.
  - Workers Free: 10만 요청/일, 요청당 CPU 10ms, subrequest 50/요청
  - D1 Free: 5백만 행 읽기/일, 10만 행 쓰기/일, 총 5GB
- **LLM 호출은 단발성**: 네트워크 I/O 위주라 CPU 10ms 제약에 걸리지 않음. 멀티스텝 에이전트/긴 배치가 없어 Queues 불필요.
- **외부 SDK 래핑**: OpenRouter는 직접 import 하지 않고 `LlmClient` 인터페이스로 래핑. 테스트는 fake 구현으로 대체.

## 개발

> 아직 스캐폴드 전. 아래는 예정된 명령.

```bash
pnpm install

# 프론트 (Vite, :5173) — /api 요청은 wrangler dev로 프록시
pnpm --filter web dev

# 백엔드 (wrangler dev, :8787)
pnpm --filter api dev
```

### 환경 변수

LLM API 키 등 시크릿은 Worker Secret으로 관리한다.

```bash
wrangler secret put OPENROUTER_API_KEY
```

## 배포

- 프론트: Cloudflare Pages / Static Assets
- 백엔드: Cloudflare Workers (`wrangler deploy`)
