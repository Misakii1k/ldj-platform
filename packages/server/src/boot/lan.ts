/**
 * 局域网地址检测与入口输出（FR-BOOT-001/002）。
 *
 * qrTarget 的选取顺序（修开热点场景下因旧 wlan0 IP 缓存导致扫码连不上）：
 * 1. 显式 PUBLIC_BASE_URL；
 * 2. 热点网卡地址（接口名/网段命中 hotspot 分类）；
 * 3. Wi-Fi / 以太网网卡地址；
 * 4. 其它非虚拟网卡地址；
 * 5. 127.0.0.1 兜底。
 *
 * 虚拟网卡（docker/vmware/virtualbox/hyperv/VPN 隧道/utun 等）一律排除出 qrTarget，
 * 避免桌面主机模式下把容器或虚拟网络 IP 写进二维码。
 */
import os from 'node:os';

export type NetworkType = 'hotspot' | 'wifi' | 'ethernet' | 'other';

export interface LanAddress {
  interfaceName: string;
  address: string;
  type: NetworkType;
}

/** 已知虚拟网卡/隧道接口名前缀，qrTarget 不取这些地址 */
const VIRTUAL_IFACE_PREFIXES = [
  'docker', 'br-', 'veth', 'virbr', 'vmnet', 'vboxnet', 'vEthernet',
  'tun', 'tap', 'utun', 'ppp', 'ipsec', 'nord', 'wg', 'overlay',
];

/** 已知虚拟/保留 IP 段，qrTarget 不取这些地址 */
const VIRTUAL_IP_PREFIXES = [
  '198.18.', '198.19.', // IANA 基准测试
  '169.254.', // 链路本地
  '100.64.', '100.65.', '100.66.', '100.67.', '100.68.', '100.69.', // CGNAT
  'fc', 'fd', // IPv6 ULA（防 IPv6 字符串误匹配 IPv4）
];

function isVirtualInterface(name: string): boolean {
  const lower = name.toLowerCase();
  return VIRTUAL_IFACE_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()));
}

function isVirtualIp(address: string): boolean {
  return VIRTUAL_IP_PREFIXES.some((p) => address.startsWith(p));
}

/** 该网卡地址是否适合作为 qrTarget 候选 */
export function isCandidateQrTarget(addr: LanAddress): boolean {
  return !isVirtualInterface(addr.interfaceName) && !isVirtualIp(addr.address);
}

function classifyNetworkType(name: string, address: string): NetworkType {
  const lowerName = name.toLowerCase();
  // 常见热点网段：Android (192.168.43.x), Windows (192.168.137.x), iOS (172.20.10.x)
  // 热点接口名：ap0/softap0/wlan1/wlan-ap (Android), enxdhcp* (Linux), *hotspot*/*tether*
  if (
    address.startsWith('192.168.43.') ||
    address.startsWith('192.168.137.') ||
    address.startsWith('172.20.10.') ||
    lowerName.includes('hotspot') ||
    lowerName.includes('tether') ||
    lowerName.includes('wlan-ap') ||
    lowerName.includes('softap') ||
    lowerName === 'ap0' ||
    lowerName === 'wlan1'
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

/** 按 qrTarget 适用度排序：热点 > wifi/eth > other；虚拟网卡排最后 */
function rankByQrPreference(addrs: readonly LanAddress[]): LanAddress[] {
  const score = (a: LanAddress): number => {
    if (!isCandidateQrTarget(a)) return -1;
    if (a.type === 'hotspot') return 3;
    if (a.type === 'wifi' || a.type === 'ethernet') return 2;
    return 1;
  };
  return [...addrs].sort((x, y) => score(y) - score(x));
}

export interface EntryUrls {
  local: string;
  lan: string[];
  /** 二维码使用的地址：PUBLIC_BASE_URL 优先，否则按热点>wifi>eth 优先级选最佳候选 */
  qrTarget: string;
  primaryType: 'hotspot' | 'wifi' | 'local_only';
  interfaces: LanAddress[];
}

export function buildEntryUrls(port: number, publicBaseUrl: string | null): EntryUrls {
  const detected = detectLanAddresses();
  const lan = detected.map((a) => `http://${a.address}:${port}`);
  const local = `http://127.0.0.1:${port}`;

  const ranked = rankByQrPreference(detected);
  const best = ranked.find(isCandidateQrTarget);
  const qrTarget = publicBaseUrl ?? (best ? `http://${best.address}:${port}` : local);

  let primaryType: 'hotspot' | 'wifi' | 'local_only' = 'local_only';
  if (detected.some((d) => d.type === 'hotspot')) {
    primaryType = 'hotspot';
  } else if (detected.length > 0) {
    primaryType = 'wifi';
  }

  return { local, lan, qrTarget, primaryType, interfaces: detected };
}
