import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import type { ServerConfig } from '../../src/config.js';
import { createApplication, type ServerApplication } from '../../src/gateway/app.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function fixture(): Promise<{ app: ServerApplication; config: ServerConfig }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lan-party-server-'));
  const clientDistDir = path.join(root, 'client');
  await mkdir(clientDistDir);
  await writeFile(path.join(clientDistDir, 'index.html'), '<!doctype html><title>局域网桌游</title>');

  const config: ServerConfig = {
    host: '127.0.0.1',
    port: 0,
    dataDir: path.join(root, 'data'),
    clientDistDir,
    allowedOrigins: [],
    allowMissingOrigin: false,
    logLevel: 'silent',
    roomRetentionHours: 24,
    chatRetentionDays: 7,
    eventRetentionDays: 30,
  };
  const app = createApplication(config, pino({ level: 'silent' }));
  cleanups.push(async () => {
    await app.stop();
    await rm(root, { recursive: true, force: true });
  });
  return { app, config };
}

describe('server application', () => {
  it('serves health, diagnostics, and the client shell', async () => {
    const { app } = await fixture();
    const started = await app.start();
    const base = `http://127.0.0.1:${String(started.port)}`;

    const live = await fetch(`${base}/health/live`);
    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({ status: 'live' });

    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({ status: 'ready' });

    const diagnostics = await fetch(`${base}/diagnostics`);
    await expect(diagnostics.json()).resolves.toMatchObject({
      version: '0.2.0-alpha.1',
      ready: true,
      roomCount: 0,
    });

    const home = await fetch(base);
    expect(await home.text()).toContain('局域网桌游');
  });

  it('accepts same-origin WebSocket clients and emits welcome', async () => {
    const { app } = await fixture();
    const started = await app.start();
    const origin = `http://127.0.0.1:${String(started.port)}`;
    const socket = new WebSocket(`ws://127.0.0.1:${String(started.port)}/ws`, { origin });

    const message = await new Promise<string>((resolve, reject) => {
      socket.once('message', (data) => resolve(data.toString()));
      socket.once('error', reject);
    });
    expect(JSON.parse(message)).toMatchObject({
      v: 1,
      type: 'welcome',
      payload: { serverVersion: '0.2.0-alpha.1' },
    });
    socket.close();
  });
});
