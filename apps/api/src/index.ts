import { createApp } from './app';
import { createAuthService } from './auth/service';
import { createD1SessionRepository } from './auth/d1-session-repository';
import { createD1UserRepository } from './auth/d1-user-repository';
import { createGoogleProvider } from './auth/google-provider';
import { createD1RoutineRepository } from './routines/d1-repository';
import { createRoutineService } from './routines/service';
import { createRoutineChatService } from './routines/chat-service';
import { createD1PlanRepository } from './plans/d1-repository';
import { createPlanService } from './plans/service';
import { createPlanChatService } from './plans/chat-service';
import { createCoachService } from './plans/coach-service';
import { createOpenRouterClient } from './llm/openrouter-client';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
const now = (): Date => new Date();

const app = createApp({
  routineService: (env) => createRoutineService(createD1RoutineRepository(env.DB)),
  planService: (env) => createPlanService(createD1PlanRepository(env.DB)),
  planChatService: (env) =>
    createPlanChatService(
      createOpenRouterClient({ apiKey: env.OPENROUTER_API_KEY, model: env.LLM_MODEL }),
    ),
  coachService: (env) =>
    createCoachService(
      createOpenRouterClient({ apiKey: env.OPENROUTER_API_KEY, model: env.LLM_MODEL }),
    ),
  routineChatService: (env) =>
    createRoutineChatService(
      createOpenRouterClient({ apiKey: env.OPENROUTER_API_KEY, model: env.LLM_MODEL }),
    ),
  sessionRepository: (env) => createD1SessionRepository(env.DB),
  now,
  authService: (env) =>
    createAuthService({
      provider: createGoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.OAUTH_REDIRECT_URI,
      }),
      userRepository: createD1UserRepository(env.DB),
      sessionRepository: createD1SessionRepository(env.DB),
      now,
      sessionTtlMs: SESSION_TTL_MS,
    }),
  appRedirectPath: '/',
});

export default app;
