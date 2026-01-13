import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['node_modules/**', 'dist/**', 'the-fool/**', 'the-magician/**', 'suit/**'],
  },
  {
    files: ['src/**/*.ts', 'data/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // 型アサーションを禁止（as Type, <Type> の形式を禁止）
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // 不要な型アサーションを禁止
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // 明示的な any を禁止
      '@typescript-eslint/no-explicit-any': 'error',
      // non-null assertion (!) を禁止
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  // テストファイルでは一部ルールを警告に緩和（行単位での無効化を許可）
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  }
);
