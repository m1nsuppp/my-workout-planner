import { describe, expect, it } from 'vitest';
import { fakeRoutineService } from '../app/test-support/render-route';
import { routineQueries } from './queries';

describe('routineQueries', () => {
  it('list는 루트 키를 쓴다', () => {
    expect(routineQueries.list(fakeRoutineService()).queryKey).toEqual(['routines', 'list']);
  });

  it('detail은 id를 queryKey에 반영한다', () => {
    expect(routineQueries.detail(fakeRoutineService(), 'r1').queryKey).toEqual([
      'routines',
      'detail',
      'r1',
    ]);
  });
});
