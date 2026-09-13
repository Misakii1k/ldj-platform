/**
 * 内嵌服务器桥插件适配器。
 * 针对双运行环境无缝兼容：
 * - Android 原生环境：委托给 Capacitor 原生插件 HostServer（管理 Android 前台服务）；
 * - PC 浏览器环境：通过 HTTP 端点（/health/live、/api/network/status）与本地运行的 Node.js 交互。
 */
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './nativePlatform.ts';

export interface HostBootInfo {
  pid: number;
  version: string;
  startedAt: string;
  port: number;
  local: string;
  lan: string[];
  qrTarget: string;
  primaryType: 'hotspot' | 'wifi' | 'local_only';
}

/** 补充枚举的本地网卡地址 */
export interface NativeLanAddress {
  interfaceName: string;
  address: string;
}

export interface HostServerPluginShape {
  start(): Promise<{ ok: boolean }>;
  stop(): Promise<{ ok: boolean }>;
  status(): Promise<{ running: boolean }>;
  bootInfo(): Promise<{ boot?: HostBootInfo; error?: string }>;
  openNetworkSettings(): Promise<void>;
  /** 枚举设备全部 IPv4 网卡地址 */
  lanAddresses(): Promise<{ addresses: NativeLanAddress[] }>;
}

const NativeHostServer = registerPlugin<HostServerPluginShape>('HostServer');

/** 判断当前浏览器是否在访问本机服务（localhost / 127.0.0.1） */
export function isLocalhostOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export const HostServer: HostServerPluginShape = {
  async start() {
    if (isNativeApp()) {
      return NativeHostServer.start();
    }
    return { ok: true };
  },

  async stop() {
    if (isNativeApp()) {
      return NativeHostServer.stop();
    }
    return { ok: true };
  },

  async status() {
    if (isNativeApp()) {
      return NativeHostServer.status();
    }
    try {
      const res = await fetch('/health/live', { signal: AbortSignal.timeout(1000) });
      return { running: res.ok };
    } catch {
      return { running: false };
    }
  },

  async bootInfo() {
    if (isNativeApp()) {
      return NativeHostServer.bootInfo();
    }
    try {
      const res = await fetch('/api/network/status', { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const data = (await res.json()) as {
        local?: string;
        lan?: string[];
        qrTarget?: string;
        primaryType?: 'hotspot' | 'wifi' | 'local_only';
      };
      const currentPort = window.location.port ? Number(window.location.port) : 8080;
      return {
        boot: {
          pid: 0,
          version: '0.4.0',
          startedAt: new Date().toISOString(),
          port: currentPort,
          local: data.local || `http://127.0.0.1:${currentPort}`,
          lan: Array.isArray(data.lan) ? data.lan : [],
          qrTarget: data.qrTarget || data.local || `http://127.0.0.1:${currentPort}`,
          primaryType: data.primaryType || 'wifi',
        },
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  },

  async openNetworkSettings() {
    if (isNativeApp()) {
      return NativeHostServer.openNetworkSettings();
    }
  },

  async lanAddresses() {
    if (isNativeApp()) {
      return NativeHostServer.lanAddresses();
    }
    try {
      const res = await fetch('/api/network/status', { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return { addresses: [] };
      const data = (await res.json()) as { lan?: string[] };
      const addresses: NativeLanAddress[] = [];
      if (Array.isArray(data.lan)) {
        for (const u of data.lan) {
          try {
            const parsed = new URL(u);
            addresses.push({ interfaceName: '局域网', address: parsed.hostname });
          } catch {
            // 忽略格式异常的单条地址
          }
        }
      }
      return { addresses };
    } catch {
      return { addresses: [] };
    }
  },
};
