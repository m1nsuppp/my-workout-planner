import { queryOptions } from '@tanstack/react-query';
import type { PlanDateRange } from './repository';
import type { PlanService } from './service';

// 계획 쿼리 추상화 — custom hook이 아니라 queryOptions로 둔다(tkdodo: 훅은 그 위에 얹어야 한다).
// service를 인자로 받아 queryFn에만 위임하므로, 테스트는 fake service를 그대로 주입하면 된다.
// queryFn 뒤로 service를 숨기지 않고 useQuery는 소비처에 노출한다(캐시·무효화를 화면이 다룰 수 있게).
export const planQueries = {
  all: ['plans'] as const,
  list: (service: PlanService, range?: PlanDateRange) =>
    queryOptions({
      queryKey: [...planQueries.all, 'list', range ?? null],
      queryFn: async () => await service.list(range),
    }),
  detail: (service: PlanService, id: string) =>
    queryOptions({
      queryKey: [...planQueries.all, 'detail', id],
      queryFn: async () => await service.get(id),
    }),
  nextDay: (service: PlanService, routineId: string) =>
    queryOptions({
      queryKey: [...planQueries.all, 'next-day', routineId],
      queryFn: async () => await service.nextDay(routineId),
    }),
  // 계획 생성 진입 시드 초안(결정적). day/date가 키에 들어가 진입 컨텍스트별로 캐시된다.
  draft: (service: PlanService, routineId: string, routineDayLabel: string, date: string) =>
    queryOptions({
      queryKey: [...planQueries.all, 'draft', routineId, routineDayLabel, date],
      queryFn: async () => await service.planDraft(routineId, routineDayLabel, date),
    }),
};
