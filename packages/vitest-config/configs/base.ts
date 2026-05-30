import { defineConfig } from 'vitest/config';

// 저장소 공통 vitest 기본 설정. 소비처는 mergeConfig로 환경(node/jsdom 등)만 덧댄다.
export const baseConfig = defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.spec.*',
        '**/*.test.*',
      ],
    },
  },
});
