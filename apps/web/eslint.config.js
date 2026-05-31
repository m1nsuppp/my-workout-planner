import { config } from '@workout/eslint-config';

export default [
  // routeTree.gen.ts는 TanStack Router 플러그인이 생성하는 산출물 — 린트 대상에서 제외.
  { ignores: ['src/app/route-tree.gen.ts', 'dist/**'] },
  ...config,
  {
    // TanStack Router의 redirect()는 throw로 동작하는 프레임워크 표준(beforeLoad 가드 등).
    // Redirect 객체 throw를 허용해 only-throw-error와 충돌하지 않게 한다.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', name: 'Redirect', package: '@tanstack/router-core' }] },
      ],
    },
  },
];
