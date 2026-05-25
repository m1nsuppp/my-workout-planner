import { createApp } from './app';
import { createD1RoutineRepository } from './routines/d1-repository';
import { createRoutineService } from './routines/service';

const app = createApp({
  routineService: (env) => createRoutineService(createD1RoutineRepository(env.DB)),
});

export default app;
