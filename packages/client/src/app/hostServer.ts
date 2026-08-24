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

/** 原生层补充枚举的本地网卡地址，作为 node os.networkInterfaces() 的兜底校验 */
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
  /** 枚举设备全部 IPv4 非 loopback 网卡地址（Java NetworkInterface 视角） */
  lanAddresses(): Promise<{ addresses: NativeLanAddress[] }>;
}

export const HostServer = registerPlugin<HostServerPluginShape>('HostServer');
