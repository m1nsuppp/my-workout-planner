import { createApp } from './app';
import { createAuthService } from './auth/service';
import { createD1SessionRepository } from './auth/d1-session-repository';
import { createD1UserRepository } from './auth/d1-user-repository';
import { createGoogleProvider } from './auth/google-provider';
import { createD1RoutineRepository } from './routines/d1-repository';
import { createRoutineService } from './routines/service';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

const app = createApp({
  routineService: (env) => createRoutineService(createD1RoutineRepository(env.DB)),
  authService: (env) =>
    createAuthService({
      provider: createGoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.OAUTH_REDIRECT_URI,
      }),
      userRepository: createD1UserRepository(env.DB),
      sessionRepository: createD1SessionRepository(env.DB),
      now: () => new Date(),
      sessionTtlMs: SESSION_TTL_MS,
    }),
  appRedirectPath: '/',
});

export default app;
