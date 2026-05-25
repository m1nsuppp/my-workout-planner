import { defineConfig } from 'drizzle-kit';

// 마이그레이션은 drizzle-kit generate로 스키마에서 생성하고, 적용은 wrangler d1로 한다.
// (로컬/원격 모두 wrangler가 담당하므로 d1-http 자격증명은 여기서 불필요.)
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});
