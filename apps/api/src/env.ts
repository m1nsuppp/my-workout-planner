export interface Env {
  DB: D1Database;
  // 'production'이면 인증 placeholder(헤더 신뢰)를 끈다. wrangler vars에서 주입.
  ENVIRONMENT: string;
  // 웹앱 오리진. 상태 변경 POST(logout 등)의 Origin 검증(CSRF 2선) 기준. dev: http://localhost:5173.
  APP_ORIGIN: string;
  // Google OAuth. CLIENT_SECRET은 Worker Secret(wrangler secret put / 로컬은 .dev.vars).
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OAUTH_REDIRECT_URI: string;
  // OpenRouter — LLM 대화(루틴/계획 생성, 코치)용. 키는 Worker Secret(.dev.vars).
  OPENROUTER_API_KEY: string;
  // OpenRouter 모델 식별자. 예: "deepseek/deepseek-v4-flash". vars로 주입해 코드 수정 없이 교체.
  LLM_MODEL: string;
}
