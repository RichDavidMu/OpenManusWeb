// @ts-check
import eslint from '@eslint/js';
import pluginN from 'eslint-plugin-n';
import pluginImportX from 'eslint-plugin-import-x';
import pluginRegExp from 'eslint-plugin-regexp';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default defineConfig(
  {
    ignores: ['**/dist/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  pluginRegExp.configs['flat/recommended'],
  eslintPluginPrettierRecommended,
  {
    name: 'main',
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
        isolatedDeclarations: true,
        project: ['./packages/*/tsconfig.json'],
      },
      globals: {
        ...globals.es2023,
        ...globals.node,
      },
    },
    settings: {
      node: {
        version: '>=24.1.0',
      },
    },
    plugins: {
      n: pluginN,
      'import-x': pluginImportX,
    },
    rules: {
      'n/no-exports-assign': 'error',
      'n/no-unpublished-bin': 'error',
      'n/no-unsupported-features/es-builtins': 'error',
      'n/process-exit-as-throw': 'error',
      'n/hashbang': 'error',

      eqeqeq: ['warn', 'always', { null: 'never' }],
      'no-debugger': ['error'],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-process-exit': 'off',
      'prefer-const': [
        'warn',
        {
          destructuring: 'all',
        },
      ],

      'n/no-missing-require': [
        'error',
        {
          // for try-catching yarn pnp
          allowModules: ['pnpapi', 'vite'],
          tryExtensions: ['.ts', '.js', '.jsx', '.tsx', '.d.ts'],
        },
      ],
      'n/no-extraneous-import': [
        'error',
        {
          allowModules: [
            'vite',
            'esbuild',
            'rolldown',
            'less',
            'sass',
            'sass-embedded',
            'terser',
            'lightningcss',
            'vitest',
            'unbuild',
          ],
        },
      ],
      'n/no-extraneous-require': [
        'error',
        {
          allowModules: ['vite'],
        },
      ],
      'n/prefer-node-protocol': 'error',

      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': [
        'warn',
        { allowArgumentsExplicitlyTypedAsAny: true },
      ],
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-extra-semi': 'off',
      '@typescript-eslint/no-extra-semi': 'off', // conflicts with prettier
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
      // disable rules set in @typescript-eslint/stylistic which conflict with current code
      // we should discuss if we want to enable these as they encourage consistent code
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/prefer-function-type': 'off',

      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        },
      ],
      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true,
        },
      ],

      'regexp/prefer-regexp-exec': 'error',
      'regexp/prefer-regexp-test': 'error',
      // in some cases using explicit letter-casing is more performant than the `i` flag
      'regexp/use-ignore-case': 'off',
    },
  },
  {
    name: 'vite/globals',
    files: ['packages/**/*.?([cm])[jt]s?(x)'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-globals': ['error', 'require', '__dirname', '__filename'],
    },
  },
  {
    name: 'disables/js',
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    name: 'disables/dts',
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  {
    name: 'disables/test',
    files: ['**/__tests__/**/*.?([cm])[jt]s?(x)'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    name: 'disables/typechecking',
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.d.ts', '**/*.d.cts', 'docs/**', 'scripts/**'],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
  },
);
