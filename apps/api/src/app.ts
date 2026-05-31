import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { Env } from './env';
import { registerAuthRoutes, type AuthDeps } from './auth/routes';
import { registerRoutineRoutes, type RoutineDeps } from './routines/routes';

export type AppDeps = RoutineDeps & AuthDeps;

// cors origin 콜백의 c는 제네릭 없는 Context라 c.env가 any다 — APP_ORIGIN만 zod로 뽑아낸다.
const CorsEnv = z.object({ APP_ORIGIN: z.string() });

// 의존성을 주입받아 앱을 만든다. 프로덕션은 D1 저장소를, 테스트는 fake를 주입.
export function createApp(deps: AppDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // web↔api 서브도메인 분리(cross-origin) — fetch가 sid 쿠키를 싣게 하려면
  // 정확한 오리진 + credentials 허용이 필요하다. APP_ORIGIN과 일치하는 출처만 허용한다.
  app.use(
    '*',
    cors({
      origin: (origin, c) => (origin === CorsEnv.parse(c.env).APP_ORIGIN ? origin : null),
      credentials: true,
    }),
  );

  app.get('/api/hello', (c) => c.json({ message: 'hello' }));
  registerAuthRoutes(app, deps);
  registerRoutineRoutes(app, deps);
  return app;
}
