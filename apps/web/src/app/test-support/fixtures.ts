import { GetPlanResponseDto } from '@workout/contracts';
import type { Plan } from '../../plans/repository';

// 계획 fixture — plan-detail/workout/coach 화면이 공유한다. status만 바꿔 상태별 분기를 검증한다.
// id가 평문이 아니라 DTO 파생이라 계약 스키마로 parse해 검증 통과분을 쓴다.
export function makePlan(over: { status?: Plan['status'] } = {}): Plan {
  const envelope = GetPlanResponseDto.parse({
    ok: true,
    data: {
      id: 'p1',
      routineId: 'r1',
      routineDayLabel: '상체 A',
      date: '2026-05-25',
      status: over.status ?? 'scheduled',
      exercises: [
        {
          name: '벤치',
          muscleGroups: ['chest'],
          sets: [{ id: 's1', targetWeightKg: 50, targetReps: 8 }],
        },
      ],
      createdAt: '2026-05-25T00:00:00.000Z',
    },
  });
  if (!envelope.ok) {
    throw new Error('unreachable');
  }

  return envelope.data;
}
