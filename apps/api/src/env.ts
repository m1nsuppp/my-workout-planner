export interface Env {
  DB: D1Database;
  // 'production'이면 인증 placeholder(헤더 신뢰)를 끈다. wrangler vars에서 주입.
  ENVIRONMENT: string;
  // Google OAuth. CLIENT_SECRET은 Worker Secret(wrangler secret put / 로컬은 .dev.vars).
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OAUTH_REDIRECT_URI: string;
}
