import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { baseConfig } from '@workout/vitest-config/base';
import { defineConfig, mergeConfig } from 'vitest/config';

// 모든 api 테스트를 Workers 런타임(workerd)에서 실행한다.
// repository 테스트는 Miniflare D1(env.DB)을 쓰고, 마이그레이션은 setup에서 적용한다.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');

  return mergeConfig(
    baseConfig,
    defineConfig({
      plugins: [
        cloudflareTest({
          wrangler: { configPath: './wrangler.jsonc' },
          // 마이그레이션 목록을 테스트 전용 바인딩으로 주입 → setup에서 applyD1Migrations.
          miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
        }),
      ],
      test: { setupFiles: ['./test/apply-migrations.ts'] },
    }),
  );
});
