import { baseConfig } from '@workout/vitest-config/base';
import { defineConfig, mergeConfig } from 'vitest/config';

// 브라우저 DOM이 필요한 컴포넌트 테스트를 위해 jsdom 환경을 덧대고,
// 커버리지 측정 범위(앱의 관심사)를 여기서 정한다 — 공유 base는 메커니즘만 둔다.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/app/test-support/setup.ts'],
      coverage: {
        // 테스트가 import한 파일만 세면 미테스트 파일이 빠져 거짓 안도가 된다.
        // include로 src 전체를 분모에 넣어 실측치를 강제한다(vitest 4: coverage.all 제거됨).
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          '**/*.gen.*', // TanStack route-tree 등 코드 생성물
          'src/app/test-support/**', // 테스트 인프라 — 분모에서 제외
        ],
      },
    },
  }),
);
