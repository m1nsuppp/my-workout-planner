import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  CreatePlanRequestDto,
  CreatePlanResponseDto,
  GetPlanResponseDto,
  NextDayResponseDto,
  PlanChatRequestDto,
  UpdatePlanStatusRequestDto,
  UpdateSetRequestDto,
  UpdateSetResponseDto,
} from '@workout/contracts';
import type { Env } from '../env';
import { getUserId } from '../auth';
import type { SessionRepository } from '../auth/session-repository';
import { LlmError } from '../llm/client';
import { Status, failBody, okBody } from '../response';
import type { PlanChatService } from './chat-service';
import type { NewPlan } from './repository';
import { InvalidPlanTransitionError, PlanValidationError, type PlanService } from './service';

export interface PlanDeps {
  planService: (env: Env) => PlanService;
  planChatService: (env: Env) => PlanChatService;
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

  // 상태 전이(운동 시작/종료). scheduled→in_progress→completed만 허용, 역전이는 409.
  app.patch('/api/plans/:id/status', async (c) => {
    const userId = await authenticate(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const parsed = UpdatePlanStatusRequestDto.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        failBody('VALIDATION_FAILED', '상태 형식이 올바르지 않습니다.', parsed.error.issues),
        Status.UNPROCESSABLE,
      );
    }

    try {
      const record = await deps
        .planService(c.env)
        .updateStatus(userId, c.req.param('id'), parsed.data.status);
      if (record === null) {
        return c.json(failBody('NOT_FOUND', '계획을 찾을 수 없습니다.'), Status.NOT_FOUND);
      }

      return c.json(okBody(GetPlanResponseDto, record), Status.OK);
    } catch (e) {
      if (e instanceof InvalidPlanTransitionError) {
        return c.json(
          failBody('INVALID_STATE_TRANSITION', `${e.from} → ${e.to} 전이는 허용되지 않습니다.`),
          Status.CONFLICT,
        );
      }

      throw e;
    }
  });

  // 다음 차례 Day 자동 제시 — 화면이 계획 생성 진입 시 기본 Day로 채운다(사용자가 바꿀 수 있음).
  app.get('/api/routines/:id/next-day', async (c) => {
    const userId = await authenticate(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const next = await deps.planService(c.env).nextDay(userId, c.req.param('id'));
    if (next === null) {
      return c.json(failBody('NOT_FOUND', '루틴을 찾을 수 없습니다.'), Status.NOT_FOUND);
    }

    return c.json(
      okBody(NextDayResponseDto, { routineDayId: next.routineDayId, label: next.label }),
      Status.OK,
    );
  });

  // 세트 실제 수행값 기록·정정(S7). completedAt은 클라가 못 정하고 서버 시각으로 찍는다.
  app.patch('/api/sets/:id', async (c) => {
    const userId = await authenticate(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const parsed = UpdateSetRequestDto.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        failBody('VALIDATION_FAILED', '세트 기록 형식이 올바르지 않습니다.', parsed.error.issues),
        Status.UNPROCESSABLE,
      );
    }

    const actual = { ...parsed.data, completedAt: deps.now().toISOString() };
    const set = await deps.planService(c.env).updateSet(userId, c.req.param('id'), actual);
    if (set === null) {
      return c.json(failBody('NOT_FOUND', '세트를 찾을 수 없습니다.'), Status.NOT_FOUND);
    }

    return c.json(okBody(UpdateSetResponseDto, set), Status.OK);
  });

  // 계획 생성 대화 — 클라는 식별자(routineId/routineDayLabel/date)만 보내고,
  // 과부하 기록은 서버가 조립해 chat-service에 싣는다. 응답은 SSE(delta×N + result), 실패는 event:error.
  app.post('/api/plans/chat', async (c) => {
    const userId = await authenticate(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const parsed = PlanChatRequestDto.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        failBody('VALIDATION_FAILED', '대화 형식이 올바르지 않습니다.', parsed.error.issues),
        Status.UNPROCESSABLE,
      );
    }
    const { routineId, routineDayLabel, date, history } = parsed.data;

    return streamSSE(c, async (stream) => {
      try {
        const overloads = await deps
          .planService(c.env)
          .overloadFor(userId, routineId, routineDayLabel);
        const proposal = await deps
          .planChatService(c.env)
          .reply({ routineId, routineDayLabel, date, overloads }, history, async (text) => {
            await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text }) });
          });
        await stream.writeSSE({ event: 'result', data: JSON.stringify(proposal) });
      } catch (e) {
        const error =
          e instanceof LlmError
            ? { code: 'LLM_FAILED', message: 'AI 응답 생성에 실패했어요.' }
            : { code: 'INTERNAL', message: '서버 오류가 발생했어요.' };
        await stream.writeSSE({ event: 'error', data: JSON.stringify(error) });
      }
    });
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
