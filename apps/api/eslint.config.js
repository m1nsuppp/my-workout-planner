import { config } from '@workout/eslint-config';

export default [
  ...config,
  {
    // apps/api 한정 규칙: DB FK(.references())를 쓰지 않는다 — 무결성은 앱 레벨에서 다룬다.
    files: ['**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='references']",
          message: 'FK(.references())는 사용하지 않습니다. 무결성은 애플리케이션 레벨에서 보장하세요.',
        },
      ],
    },
  },
];
