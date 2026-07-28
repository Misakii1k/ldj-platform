/**
 * 局域网地址检测与入口输出（FR-BOOT-001/002）。
 */
import os from 'node:os';

export interface LanAddress {
  interfaceName: string;
  address: string;
}

/** 列出全部 IPv4 非 internal 地址（多网卡全部列出） */
export function detectLanAddresses(): LanAddress[] {
  const result: LanAddress[] = [];
  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        result.push({ interfaceName: name, address: addr.address });
      }
    }
  }
  return result;
}

export interface EntryUrls {
  local: string;
  lan: string[];
  /** 二维码使用的地址：PUBLIC_BASE_URL 优先，否则第一个局域网地址 */
  qrTarget: string;
}

export function buildEntryUrls(port: number, publicBaseUrl: string | null): EntryUrls {
  const lan = detectLanAddresses().map((a) => `http://${a.address}:${port}`);
  const local = `http://127.0.0.1:${port}`;
  const qrTarget = publicBaseUrl ?? lan[0] ?? local;
  return { local, lan, qrTarget };
}
