/**
 * 局域网地址检测与入口输出（FR-BOOT-001/002）。
 */
import os from 'node:os';

export type NetworkType = 'hotspot' | 'wifi' | 'ethernet' | 'other';

export interface LanAddress {
  interfaceName: string;
  address: string;
  type: NetworkType;
}

function classifyNetworkType(name: string, address: string): NetworkType {
  const lowerName = name.toLowerCase();
  // 常见热点网段：Android (192.168.43.x), Windows (192.168.137.x), iOS (172.20.10.x)
  if (
    address.startsWith('192.168.43.') ||
    address.startsWith('192.168.137.') ||
    address.startsWith('172.20.10.') ||
    lowerName.includes('hotspot') ||
    lowerName.includes('tether') ||
    lowerName.includes('wlan-ap') ||
    lowerName.includes('ap0')
  ) {
    return 'hotspot';
  }
  if (lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('wireless')) {
    return 'wifi';
  }
  if (lowerName.includes('eth') || lowerName.includes('ethernet') || lowerName.includes('en0') || lowerName.includes('en1') || lowerName.includes('以太网')) {
    return 'ethernet';
  }
  return 'other';
}

/** 列出全部 IPv4 非 internal 地址（多网卡全部列出） */
export function detectLanAddresses(): LanAddress[] {
  const result: LanAddress[] = [];
  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        result.push({
          interfaceName: name,
          address: addr.address,
          type: classifyNetworkType(name, addr.address),
        });
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
  primaryType: 'hotspot' | 'wifi' | 'local_only';
  interfaces: LanAddress[];
}

export function buildEntryUrls(port: number, publicBaseUrl: string | null): EntryUrls {
  const detected = detectLanAddresses();
  const lan = detected.map((a) => `http://${a.address}:${port}`);
  const local = `http://127.0.0.1:${port}`;
  
  // 优先推荐非 198.18 (虚拟网卡) 且是局域网/热点的真实可用地址
  const preferred = detected.find((d) => !d.address.startsWith('198.18.')) ?? detected[0];
  const qrTarget = publicBaseUrl ?? (preferred ? `http://${preferred.address}:${port}` : local);

  let primaryType: 'hotspot' | 'wifi' | 'local_only' = 'local_only';
  if (detected.some((d) => d.type === 'hotspot')) {
    primaryType = 'hotspot';
  } else if (detected.length > 0) {
    primaryType = 'wifi';
  }

  return { local, lan, qrTarget, primaryType, interfaces: detected };
}
