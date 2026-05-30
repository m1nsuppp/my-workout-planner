import { baseConfig } from '@workout/vitest-config/base';
import { defineConfig, mergeConfig } from 'vitest/config';

// 브라우저 DOM이 필요한 컴포넌트 테스트를 위해 jsdom 환경만 덧댄다.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: { environment: 'jsdom' },
  }),
);
