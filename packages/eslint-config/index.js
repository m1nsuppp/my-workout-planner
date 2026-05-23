import loveConfig from 'eslint-config-love';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {Array<import("eslint").Linter.Config>}
 * */
export const config = [
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
];
