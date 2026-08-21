// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'poc/**',
      'scratch/**',
      'eslint.config.js',
      'packages/client/vite.config.ts',
      // Capacitor 安卓工程：Java/Gradle 与拷贝进去的 web 构建产物，不参与 JS lint
      'packages/client/android/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
    },
  },
  {
    files: ['packages/client/public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        clients: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'packages/server/scripts/**/*.mjs', 'packages/client/scripts/**/*.mjs', 'e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        WebSocket: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
);
