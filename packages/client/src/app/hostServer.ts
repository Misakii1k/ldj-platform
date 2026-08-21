/**
 * 内嵌服务器桥插件 wrapper（仅原生 APP 可用）。
 * 浏览器环境调用会抛「not implemented」，调用方须以 isNativeApp() 守卫。
 */
import { registerPlugin } from '@capacitor/core';

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

export interface HostServerPluginShape {
  start(): Promise<{ ok: boolean }>;
  stop(): Promise<{ ok: boolean }>;
  status(): Promise<{ running: boolean }>;
  bootInfo(): Promise<{ boot?: HostBootInfo; error?: string }>;
  openNetworkSettings(): Promise<void>;
}

export const HostServer = registerPlugin<HostServerPluginShape>('HostServer');
