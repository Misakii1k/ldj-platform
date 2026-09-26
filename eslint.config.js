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
      // 临时工作树、外部代理目录与历史归档脚本，不参与主工程 lint
      '.claude/**',
      '.workbuddy-ai/**',
      'output/**',
      'scripts/archive/**',
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
    files: ['scripts/audit-*.mjs', 'scripts/verify-ingame-motion.mjs', 'scripts/capture-visual-audit.mjs'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        MutationObserver: 'readonly',
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
  {
    // 设计预览原型：由 HTML 以 <script> 直接加载的普通浏览器 JS，无构建、不进产物。
    // 若不声明浏览器全局，会被当成 Node 环境校验并产生大量 no-undef 噪声。
    files: ['docs/ui-preview/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        parent: 'readonly',
        console: 'readonly',
        getComputedStyle: 'readonly',
        addEventListener: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        HTMLElement: 'readonly',
        Option: 'readonly',
        ResizeObserver: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },
  {
    // 预览目录下的一次性 Playwright 复核脚本：Node 环境运行，
    // 但其中 page.evaluate() 的回调会在浏览器里执行，因此同时需要浏览器全局
    // （与上面 scripts/audit-*.mjs 的处理方式一致）。
    files: ['docs/ui-preview/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        sessionStorage: 'readonly',
        localStorage: 'readonly',
        getComputedStyle: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        HTMLElement: 'readonly',
        ResizeObserver: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },
);
