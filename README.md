# my-workout-planner

LLM 기반 운동 루틴 추천 웹 애플리케이션.

프론트엔드와 백엔드를 한 저장소에 co-locate 한 monorepo이며, API 와이어 계약(엔드포인트 DTO + 에러 봉투)을 `packages/contracts`에 두고 양쪽이 경계에서만 소비한다.

## 기술 스택

| 레이어     | 선택                     | 비고                                            |
| ---------- | ------------------------ | ----------------------------------------------- |
| 모노레포   | pnpm workspaces          | JIT(소스 직접 소비) 방식으로 공유 패키지 import |
| 프론트엔드 | React + Vite             | Cloudflare Pages / Static Assets 배포           |
| 백엔드     | Hono                     | Cloudflare Workers 배포                         |
| DB / ORM   | D1 (SQLite) + Drizzle    | 스키마 단일 소스, `drizzle-kit`로 마이그레이션 생성 |
| 공유       | zod 계약(DTO) + 봉투      | `packages/contracts`. 경계에서만 소비, 도메인은 각자 매핑 |
| LLM        | OpenRouter (OpenAI 호환) | Worker가 프록시(BFF), 키는 Worker Secret        |

## 구조

```
my-workout-planner/
├─ apps/
│  ├─ web/        # React + Vite (프론트엔드)
│  └─ api/        # Hono (백엔드, Cloudflare Workers)
├─ packages/
│  └─ contracts/  # 엔드포인트 DTO(zod) + 에러 봉투. 공개 표면은 DTO만
├─ pnpm-workspace.yaml
└─ package.json
```

### 타입 흐름

`packages/contracts`의 zod DTO를 와이어 계약의 단일 소스로 삼아:

1. 서버가 요청을 `*RequestDto`로 검증(`safeParse`), 응답을 `*ResponseDto`(봉투)로 검증해 반환
2. `z.infer`로 추론된 타입을 프론트·백이 **경계에서만** 사용하고, 각자 도메인 모델로 매핑
3. 구성 블록(`Routine`/`Plan` 등)·값 타입은 contracts 내부로 숨겨 변경 파급을 매핑 레이어에 가둠

## 아키텍처 결정 사항

- **Edge 배포(Cloudflare Workers)**: 콜드스타트 사실상 0, 개인용 규모에서 무료 티어로 운영 가능.
  - Workers Free: 10만 요청/일, 요청당 CPU 10ms, subrequest 50/요청
  - D1 Free: 5백만 행 읽기/일, 10만 행 쓰기/일, 총 5GB
- **LLM 호출은 단발성**: 네트워크 I/O 위주라 CPU 10ms 제약에 걸리지 않음. 멀티스텝 에이전트/긴 배치가 없어 Queues 불필요.
- **외부 SDK 래핑**: OpenRouter는 직접 import 하지 않고 `Llm` 인터페이스로 래핑. 테스트는 fake 구현으로 대체.
- **DB FK 미사용**: 참조 무결성은 애플리케이션 레벨에서 보장(eslint로 `.references()` 금지). 계획=생성 시점 스냅샷 원칙과도 정렬.

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
