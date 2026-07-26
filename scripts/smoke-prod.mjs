import console from 'node:console';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { createApplication } from '../packages/server/dist/gateway/app.js';
import { createLogger } from '../packages/server/dist/logger.js';

const temporaryParent = path.resolve(process.cwd(), '.tmp');
await mkdir(temporaryParent, { recursive: true });
const temporaryRoot = await mkdtemp(path.join(temporaryParent, 'production-smoke-'));
if (!temporaryRoot.startsWith(`${temporaryParent}${path.sep}`)) {
  throw new Error('Refusing to use an unexpected smoke-test directory');
}

const config = {
  host: '127.0.0.1',
  port: 0,
  dataDir: path.join(temporaryRoot, 'data'),
  clientDistDir: path.resolve(process.cwd(), 'packages/client/dist/web'),
  allowedOrigins: [],
  allowMissingOrigin: false,
  logLevel: 'silent',
  roomRetentionHours: 24,
  chatRetentionDays: 7,
  eventRetentionDays: 30,
};

const application = createApplication(config, createLogger(config));
try {
  const started = await application.start();
  const baseUrl = `http://127.0.0.1:${String(started.port)}`;
  const [ready, home] = await Promise.all([
    globalThis.fetch(`${baseUrl}/health/ready`),
    globalThis.fetch(baseUrl),
  ]);
  const readyPayload = await ready.json();
  const homeText = await home.text();
  if (ready.status !== 200 || readyPayload.status !== 'ready') {
    throw new Error('Production readiness check failed');
  }
  if (home.status !== 200 || !homeText.includes('局域网桌游')) {
    throw new Error('Production client shell check failed');
  }
  console.log(JSON.stringify({ ready: readyPayload.status, home: home.status }));
} finally {
  await application.stop();
  await rm(temporaryRoot, { recursive: true, force: true });
}
