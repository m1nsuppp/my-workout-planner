import { Hono } from 'hono';
import type { Env } from './env';
import { registerRoutineRoutes, type RoutineDeps } from './routines/routes';

// 의존성을 주입받아 앱을 만든다. 프로덕션은 D1 저장소를, 테스트는 fake를 주입.
export function createApp(deps: RoutineDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/api/hello', (c) => c.json({ message: 'hello' }));
  registerRoutineRoutes(app, deps);
  return app;
}
