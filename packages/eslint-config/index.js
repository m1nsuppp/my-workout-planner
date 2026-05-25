import loveConfig from 'eslint-config-love';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * 테스트 파일은 *.test 대신 *.spec 확장자를 쓰도록 강제하는 로컬 룰.
 * 파일 경로만 보면 되므로 외부 플러그인 없이 context.filename으로 검사한다.
 */
const conventionPlugin = {
  rules: {
    'no-test-suffix': {
      meta: {
        type: 'problem',
        messages: { useSpec: '테스트 파일은 *.test가 아니라 *.spec 확장자를 쓰세요.' },
      },
      create(context) {
        return {
          Program(node) {
            if (/\.test\.tsx?$/.test(context.filename)) {
              context.report({ node, messageId: 'useSpec' });
            }
          },
        };
      },
    },
  },
};

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {Array<import("eslint").Linter.Config>}
 * */
export const config = [
  {
    // 빌드·도구 산출물은 린트 대상에서 제외.
    ignores: ['**/dist/**', '**/coverage/**', '**/.wrangler/**'],
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { convention: conventionPlugin },
    rules: { 'convention/no-test-suffix': 'error' },
  },
  {
    ...loveConfig,
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      ...loveConfig.rules,
      '@typescript-eslint/triple-slash-reference': 'off',
      // https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/avoid-new.md
      'promise/avoid-new': 'off',
      /** Disables checking an asynchronous function passed as a JSX attribute expected to be a function that returns `void`. */
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-magic-numbers': [
        'warn',
        {
          ignore: [0, 1, -1, 7, 12, 24, 30, 60, 100, 255, 1000, 1024, 10000, 1000000],
        },
      ],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      complexity: ['error', { max: 20 }],
      'eslint-comments/require-description': ['error', { ignore: [] }],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'multiline-expression', next: 'return' },
        { blankLine: 'always', prev: 'multiline-block-like', next: 'return' },
        { blankLine: 'always', prev: 'block-like', next: 'return' },
        { blankLine: 'always', prev: 'const', next: 'return' },
        { blankLine: 'always', prev: 'let', next: 'return' },
        { blankLine: 'always', prev: 'var', next: 'return' },
        { blankLine: 'always', prev: 'if', next: 'return' },
        { blankLine: 'always', prev: 'for', next: 'return' },
        { blankLine: 'always', prev: 'while', next: 'return' },
        { blankLine: 'always', prev: 'do', next: 'return' },
        { blankLine: 'always', prev: 'switch', next: 'return' },
        { blankLine: 'always', prev: 'try', next: 'return' },
      ],
      '@typescript-eslint/prefer-destructuring': 'off',
    },
  },
  eslintConfigPrettier,
  {
    rules: {
      curly: ['error', 'all'],
    },
  },
  {
    // 테스트는 공개 동작만 검증한다. Response.json(): any 등과 싸우는 앱 수준 엄격함은 완화.
    files: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
];
