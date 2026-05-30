import { config } from '@workout/eslint-config';

export default [
  // routeTree.gen.ts는 TanStack Router 플러그인이 생성하는 산출물 — 린트 대상에서 제외.
  { ignores: ['src/route-tree.gen.ts', 'dist/**'] },
  ...config,
];
