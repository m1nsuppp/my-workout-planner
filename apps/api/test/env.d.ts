/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

// cloudflare:test의 env 타입(Cloudflare.Env)에 우리 바인딩 + 테스트 전용 바인딩을 명시.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      ENVIRONMENT: string;
      TEST_MIGRATIONS: D1Migration[];
    }
  }

  // Workers 런타임의 Headers.getSetCookie()를 타입에 알린다(workers-types 미수록).
  interface Headers {
    getSetCookie: () => string[];
  }
}
