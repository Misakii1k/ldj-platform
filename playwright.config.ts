/**
 * Playwright E2E 配置（D4 P0 基础设施）。
 * - testDir: e2e/（spec 全部位于 e2e/**）
 * - baseURL: 与 webServer 端口一致（127.0.0.1:3178）
 * - workers: 1 + fullyParallel false：串行 owner，避免房间级/DB 级并行干扰
 * - webServer: 真实服务端入口 `node packages/server/src/index.ts`（经 start-server.mjs
 *   清空临时 DATA_DIR 后启动）；env 只配 PORT/DATA_DIR/LOG_LEVEL，不配任何 LLM 变量
 *   → llmAvailable=false，机器人走规则模式，零真实供应商调用
 * - 就绪探针 /health/live（已核实存在于 packages/server/src/gateway/http.ts）
 */
import { defineConfig } from '@playwright/test';
import { BASE_URL, DATA_DIR } from './e2e/helpers/serverEnv.ts';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/helpers/start-server.mjs',
    url: `${BASE_URL}/health/live`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      PORT: '3178',
      DATA_DIR,
      LOG_LEVEL: 'warn',
    },
  },
});
