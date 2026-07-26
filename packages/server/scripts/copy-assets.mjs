import { cp, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/persistence/', import.meta.url), { recursive: true });
await cp(
  new URL('../src/persistence/migrations/', import.meta.url),
  new URL('../dist/persistence/migrations/', import.meta.url),
  { recursive: true },
);
