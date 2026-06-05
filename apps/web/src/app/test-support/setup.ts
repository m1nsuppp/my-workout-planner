import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vitest globals를 끈 채라 testing-library의 자동 cleanup이 걸리지 않는다 —
// 수동 등록해 테스트 간 DOM 누적(중복 요소로 인한 쿼리 충돌)을 막는다.
afterEach(() => {
  cleanup();
});
