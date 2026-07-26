export type RandomByteFiller = (bytes: Uint8Array) => Uint8Array;

const fillWithBrowserCrypto: RandomByteFiller = (bytes) => crypto.getRandomValues(bytes);

export function createRandomId(
  prefix: 'device' | 'web',
  fill: RandomByteFiller = fillWithBrowserCrypto,
): string {
  const bytes = fill(new Uint8Array(16));
  if (bytes.length !== 16) throw new Error('Random source returned an invalid byte count');
  const encoded = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${encoded}`;
}
