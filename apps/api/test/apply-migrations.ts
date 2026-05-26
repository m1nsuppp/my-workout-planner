import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// 각 테스트 격리 D1에 마이그레이션을 적용한다(테스트 전용 TEST_MIGRATIONS 바인딩 사용).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
