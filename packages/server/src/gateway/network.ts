import os from 'node:os';

import QRCode from 'qrcode';

export function listLanAddresses(port: number): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.add(`http://${entry.address}:${String(port)}`);
      }
    }
  }
  return [...addresses].sort();
}

export function selectPublicAddress(
  port: number,
  publicBaseUrl: string | undefined,
  candidates: readonly string[],
): string {
  return publicBaseUrl ?? candidates[0] ?? `http://127.0.0.1:${String(port)}`;
}

export async function renderTerminalQr(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'terminal', small: true });
}
