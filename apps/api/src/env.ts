export interface Env {
  DB: D1Database;
  // 'production'이면 인증 placeholder(헤더 신뢰)를 끈다. wrangler vars에서 주입.
  ENVIRONMENT: string;
}
