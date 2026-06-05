import { queryOptions } from '@tanstack/react-query';
import type { RoutineService } from './service';

// 루틴 쿼리 추상화 — plans/queries와 동형. service를 queryFn에만 위임하고 useQuery는 화면에 노출한다.
export const routineQueries = {
  all: ['routines'] as const,
  list: (service: RoutineService) =>
    queryOptions({
      queryKey: [...routineQueries.all, 'list'],
      queryFn: async () => await service.list(),
    }),
  detail: (service: RoutineService, id: string) =>
    queryOptions({
      queryKey: [...routineQueries.all, 'detail', id],
      queryFn: async () => await service.get(id),
    }),
};
