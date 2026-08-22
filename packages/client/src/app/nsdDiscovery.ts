/**
 * 局域网主机自动发现桥插件 wrapper（仅原生 APP 可用；服务端经 mDNS 广播 _ldj._tcp）。
 * 浏览器环境调用 discover 会抛「not implemented」，调用方须以 isNativeApp() 守卫。
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NsdService {
  name: string;
  host: string;
  port: number;
}

export interface NsdDiscoveryPluginShape {
  discover(options?: { serviceType?: string }): Promise<{ ok: boolean }>;
  stop(): Promise<{ ok: boolean }>;
  list(): Promise<{ services: NsdService[] }>;
  addListener(eventName: 'nsd:found', listenerFunc: (service: NsdService) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'nsd:lost', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'nsd:error', listenerFunc: () => void): Promise<PluginListenerHandle>;
}

export const NsdDiscovery = registerPlugin<NsdDiscoveryPluginShape>('NsdDiscovery');
