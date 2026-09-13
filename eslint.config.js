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
      // 构建产物 / 本地工具目录 / 视觉审计截图，不参与 lint
      'build/**',
      'durian-intro-video/build/**',
      'dsh-routing-suite/**',
      'screenshots/**',
      'd7-shots/**',
      'research/**',
      'compliance/**',
      'test-results/**',
      'playwright-report/**',
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
        AbortController: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
  {
    // 视觉审计脚本：含 Playwright page.evaluate 内运行的浏览器端代码
    files: ['scripts/audit-*.mjs', 'scripts/capture-visual-audit.mjs'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        Node: 'readonly',
        getComputedStyle: 'readonly',
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
