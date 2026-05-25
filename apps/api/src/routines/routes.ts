import type { Hono } from 'hono';
import {
  CreateRoutineRequestDto,
  CreateRoutineResponseDto,
  GetRoutineResponseDto,
  ListRoutinesResponseDto,
} from '@workout/contracts';
import type { Env } from '../env';
import { getUserId } from '../auth';
import { Status, failBody, okBody } from '../response';
import type { NewRoutine } from './repository';
import { RoutineValidationError, type RoutineService } from './service';

export interface RoutineDeps {
  routineService: (env: Env) => RoutineService;
}

export function registerRoutineRoutes(app: Hono<{ Bindings: Env }>, deps: RoutineDeps): void {
  app.post('/routines', async (c) => {
    const userId = getUserId(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const parsed = CreateRoutineRequestDto.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        failBody('VALIDATION_FAILED', '루틴 형식이 올바르지 않습니다.', parsed.error.issues),
        Status.UNPROCESSABLE,
      );
    }

    try {
      const record = await deps.routineService(c.env).create(userId, toNewRoutine(parsed.data));

      return c.json(okBody(CreateRoutineResponseDto, record), Status.CREATED);
    } catch (e) {
      if (e instanceof RoutineValidationError) {
        return c.json(
          failBody('ROUTINE_INVALID', '루틴이 유효하지 않습니다.', e.issues),
          Status.UNPROCESSABLE,
        );
      }

      throw e;
    }
  });

  app.get('/routines', async (c) => {
    const userId = getUserId(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const records = await deps.routineService(c.env).list(userId);

    return c.json(okBody(ListRoutinesResponseDto, records), Status.OK);
  });

  app.get('/routines/:id', async (c) => {
    const userId = getUserId(c);
    if (userId === null) {
      return c.json(failBody('UNAUTHENTICATED', '로그인이 필요합니다.'), Status.UNAUTHENTICATED);
    }

    const record = await deps.routineService(c.env).get(userId, c.req.param('id'));
    if (record === null) {
      return c.json(failBody('NOT_FOUND', '루틴을 찾을 수 없습니다.'), Status.NOT_FOUND);
    }

    return c.json(okBody(GetRoutineResponseDto, record), Status.OK);
  });
}

// 계약 요청 DTO → api 내부 도메인 입력으로 매핑(경계).
function toNewRoutine(draft: CreateRoutineRequestDto): NewRoutine {
  return {
    name: draft.name,
    goal: draft.goal,
    splitType: draft.splitType,
    daysPerWeek: draft.daysPerWeek,
    days: draft.days.map((day) => ({
      label: day.label,
      exercises: day.exercises.map((ex) => ({
        name: ex.name,
        muscleGroups: [...ex.muscleGroups],
        targetSets: ex.targetSets,
        targetRepRange: ex.targetRepRange,
      })),
    })),
  };
}
