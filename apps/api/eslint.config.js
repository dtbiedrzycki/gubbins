import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/infrastructure/*', '**/infrastructure'], message: 'application/ may not import infrastructure/ (Clean Architecture boundary, ADR-012).' }] },
      ],
    },
  },
  {
    // A single config block per no-restricted-imports rule instance — ESLint
    // flat config replaces, rather than merges, a repeated rule key across
    // overlapping `files` blocks, so both bans for domain/ live in one array.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/infrastructure/*', '**/infrastructure'], message: 'domain/ may not import infrastructure/ (Clean Architecture boundary, ADR-012).' },
            { group: ['**/application/*', '**/application'], message: 'domain/ may not import application/ — domain is the innermost layer and must not depend on it (Clean Architecture boundary, ADR-012).' },
          ],
        },
      ],
    },
  },
];
