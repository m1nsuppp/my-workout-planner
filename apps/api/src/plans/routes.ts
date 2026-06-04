import type { Context, Hono } from 'hono';
import { CreatePlanRequestDto, CreatePlanResponseDto, GetPlanResponseDto } from '@workout/contracts';
import type { Env } from '../env';
import { getUserId } from '../auth';
import type { SessionRepository } from '../auth/session-repository';
import { Status, failBody, okBody } from '../response';
import type { NewPlan } from './repository';
import { PlanValidationError, type PlanService } from './service';

export interface PlanDeps {
  planService: (env: Env) => PlanService;
  sessionRepository: (env: Env) => SessionRepository;
  now: () => Date;
}

export function registerPlanRoutes(app: Hono<{ Bindings: Env }>, deps: PlanDeps): void {
  const authenticate = async (c: Context<{ Bindings: Env }>): Promise<string | null> =>
    await getUserId(c, deps.sessionRepository(c.env), deps.now);

  app.post('/api/plans', async (c) => {
    const userId = await authenticate(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const parsed = CreatePlanRequestDto.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        failBody('VALIDATION_FAILED', '계획 형식이 올바르지 않습니다.', parsed.error.issues),
        Status.UNPROCESSABLE,
      );
    }

    try {
      const record = await deps.planService(c.env).create(userId, toNewPlan(parsed.data));

      return c.json(okBody(CreatePlanResponseDto, record), Status.CREATED);
    } catch (e) {
      if (e instanceof PlanValidationError) {
        return c.json(
          failBody('PLAN_INVALID', '계획이 유효하지 않습니다.', e.issues),
          Status.UNPROCESSABLE,
        );
      }

      throw e;
    }
  });

  app.get('/api/plans/:id', async (c) => {
    const userId = await authenticate(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const record = await deps.planService(c.env).get(userId, c.req.param('id'));
    if (record === null) {
      return c.json(failBody('NOT_FOUND', '계획을 찾을 수 없습니다.'), Status.NOT_FOUND);
    }

    return c.json(okBody(GetPlanResponseDto, record), Status.OK);
  });
}

// 계약 요청 DTO → api 내부 도메인 입력으로 매핑(경계).
// routineDayId는 계약에 없다 — next-day 슬라이스가 채울 자리이므로 여기선 미지정.
function toNewPlan(draft: CreatePlanRequestDto): NewPlan {
  return {
    routineId: draft.routineId,
    routineDayLabel: draft.routineDayLabel,
    date: draft.date,
    overloadNote: draft.overloadNote,
    exercises: draft.exercises.map((ex) => ({
      name: ex.name,
      muscleGroups: [...ex.muscleGroups],
      note: ex.note,
      sets: ex.sets.map((s) => ({
        targetWeightKg: s.targetWeightKg,
        targetReps: s.targetReps,
        actual:
          s.actual === undefined
            ? undefined
            : {
                weightKg: s.actual.weightKg,
                reps: s.actual.reps,
                rir: s.actual.rir,
                completedAt: s.actual.completedAt,
              },
      })),
    })),
  };
}
