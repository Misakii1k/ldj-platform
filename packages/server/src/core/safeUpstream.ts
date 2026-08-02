import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

const MAX_RESPONSE_BYTES = 256 * 1024;

export interface UpstreamAddressPolicy {
  allowPrivateNetwork?: boolean;
  lookup?: UpstreamLookup;
}

export interface UpstreamLookupAddress {
  address: string;
  family: 4 | 6;
}

export type UpstreamLookup = (hostname: string) => Promise<UpstreamLookupAddress[]>;

function isLoopback(address: string): boolean {
  return address === '::1' || address.startsWith('127.');
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
}

function isAlwaysBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return a === 0
    || a === 100 && b >= 64 && b <= 127
    || a === 169 && b === 254
    || a === 192 && (b === 0 || parts[2] === 2 || b === 88 && parts[2] === 99)
    || a === 198 && (b === 18 || b === 19 || b === 51 && parts[2] === 100)
    || a === 203 && b === 0 && parts[2] === 113
    || a >= 224;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]!;
  return normalized.startsWith('fc') || normalized.startsWith('fd');
}

function isAlwaysBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]!;
  return normalized === '::' || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff');
}

function mappedIpv4Address(address: string): string | null {
  const normalized = address.toLowerCase().split('%')[0]!;
  const sides = normalized.split('::');
  if (sides.length > 2) return null;
  const left = sides[0] === '' ? [] : sides[0]!.split(':');
  const right = sides.length === 1 || sides[1] === '' ? [] : sides[1]!.split(':');
  const missing = sides.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const values = groups.map((group) => Number.parseInt(group, 16));
  if (values.slice(0, 5).some((value) => value !== 0) || values[5] !== 0xffff) return null;
  return `${values[6]! >> 8}.${values[6]! & 0xff}.${values[7]! >> 8}.${values[7]! & 0xff}`;
}

function isBlockedAddress(address: string, policy: UpstreamAddressPolicy): boolean {
  const family = isIP(address);
  if (family === 4) {
    if (isLoopback(address)) return false;
    return isAlwaysBlockedIpv4(address) || isPrivateIpv4(address) && policy.allowPrivateNetwork !== true;
  }
  if (family === 6) {
    const mappedAddress = mappedIpv4Address(address);
    if (mappedAddress !== null) return isBlockedAddress(mappedAddress, policy);
    if (isLoopback(address)) return false;
    return isAlwaysBlockedIpv6(address) || isPrivateIpv6(address) && policy.allowPrivateNetwork !== true;
  }
  return true;
}

interface ValidatedUpstream {
  url: URL;
  addresses: UpstreamLookupAddress[];
}

async function defaultLookup(hostname: string): Promise<UpstreamLookupAddress[]> {
  return (await lookup(hostname, { all: true })).map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
}

async function resolveUpstream(
  value: string,
  policy: UpstreamAddressPolicy = {},
  signal?: AbortSignal,
): Promise<ValidatedUpstream> {
  if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INVALID_UPSTREAM_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('INVALID_UPSTREAM_URL');
  if (url.username || url.password) throw new Error('INVALID_UPSTREAM_URL');

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname, policy)) throw new Error('INVALID_UPSTREAM_URL');
    return { url, addresses: [{ address: hostname, family: isIP(hostname) as 4 | 6 }] };
  }

  let addresses: UpstreamLookupAddress[];
  try {
    addresses = await (policy.lookup ?? defaultLookup)(hostname);
  } catch {
    throw new Error('UPSTREAM_DNS_FAILED');
  }
  if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address, policy))) {
    throw new Error('INVALID_UPSTREAM_URL');
  }
  return { url, addresses };
}

export async function validateUpstreamUrl(
  value: string,
  policy: UpstreamAddressPolicy = {},
): Promise<URL> {
  return (await resolveUpstream(value, policy)).url;
}

function requestBody(body: RequestInit['body']): string | Uint8Array | null {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new TypeError('UNSUPPORTED_UPSTREAM_BODY');
}

export async function safeFetch(
  value: string | URL,
  init: RequestInit = {},
  policy: UpstreamAddressPolicy = {},
): Promise<Response> {
  const resolved = await resolveUpstream(value.toString(), policy, init.signal ?? undefined);
  const body = requestBody(init.body);
  const transport = resolved.url.protocol === 'https:' ? https : http;
  const selected = resolved.addresses[0]!;

  return new Promise<Response>((resolve, reject) => {
    const abort = () => request.destroy(new DOMException('The operation was aborted', 'AbortError'));
    const request = transport.request(resolved.url, {
      method: init.method,
      headers: Object.fromEntries(new Headers(init.headers)),
      signal: init.signal ?? undefined,
      lookup: (_hostname, options, callback) => {
        if (typeof options === 'object' && options.all) callback(null, resolved.addresses);
        else callback(null, selected.address, selected.family);
      },
    }, (response) => {
      const headers = new Headers();
      for (const [name, headerValue] of Object.entries(response.headers)) {
        if (Array.isArray(headerValue)) {
          for (const item of headerValue) headers.append(name, item);
        } else if (headerValue !== undefined) {
          headers.set(name, headerValue);
        }
      }
      const status = response.statusCode ?? 500;
      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
        status,
        statusText: response.statusMessage,
        headers,
      }));
    });
    request.once('error', reject);
    init.signal?.addEventListener('abort', abort, { once: true });
    request.once('close', () => init.signal?.removeEventListener('abort', abort));
    if (body !== null) request.write(body);
    request.end();
  });
}

export async function readLimitedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('UPSTREAM_RESPONSE_TOO_LARGE');
  }
  if (response.body === null) throw new Error('INVALID_UPSTREAM_RESPONSE');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('UPSTREAM_RESPONSE_TOO_LARGE');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
