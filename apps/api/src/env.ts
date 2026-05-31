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
}
