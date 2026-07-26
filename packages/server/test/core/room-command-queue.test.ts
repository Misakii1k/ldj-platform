import { describe, expect, it } from 'vitest';

import { RoomCommandQueue } from '../../src/core/room-command-queue.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: () => resolve?.() };
}

describe('RoomCommandQueue', () => {
  it('serializes commands in the same room', async () => {
    const queue = new RoomCommandQueue();
    const gate = deferred();
    const events: string[] = [];

    const first = queue.enqueue('room-1', async () => {
      events.push('first:start');
      await gate.promise;
      events.push('first:end');
      return 1;
    });
    const second = queue.enqueue('room-1', () => {
      events.push('second');
      return 2;
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    gate.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
    await queue.waitForIdle();
    expect(queue.activeRoomCount).toBe(0);
  });

  it('does not serialize unrelated rooms', async () => {
    const queue = new RoomCommandQueue();
    const gate = deferred();
    const first = queue.enqueue('room-1', () => gate.promise);
    const second = queue.enqueue('room-2', () => 'ready');

    await expect(second).resolves.toBe('ready');
    expect(queue.isActive('room-1')).toBe(true);
    gate.resolve();
    await first;
  });

  it('continues after a command rejects', async () => {
    const queue = new RoomCommandQueue();
    const failed = queue.enqueue('room-1', () => {
      throw new Error('expected failure');
    });
    const next = queue.enqueue('room-1', () => 'accepted');

    await expect(failed).rejects.toThrow('expected failure');
    await expect(next).resolves.toBe('accepted');
  });
});
