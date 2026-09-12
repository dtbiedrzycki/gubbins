import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['src/api/schema.gen.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['src/features/create-list/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/holds/*', '**/guest-key/*'], message: "create-list may not import another feature's internals — go through src/api/ or a shared UI primitive." }] }],
    },
  },
  {
    files: ['src/features/holds/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/create-list/*', '**/guest-key/*'], message: "holds may not import another feature's internals — go through src/api/ or a shared UI primitive." }] }],
    },
  },
  {
    files: ['src/features/guest-key/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/create-list/*', '**/holds/*'], message: "guest-key may not import another feature's internals — go through src/api/ or a shared UI primitive." }] }],
    },
  },
];
