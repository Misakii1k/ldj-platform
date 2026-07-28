import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { RoomQueues } from '../src/core/queue.ts';

test('同一房间命令严格串行', async () => {
  const queues = new RoomQueues();
  const order: number[] = [];

  const p1 = queues.enqueue('room-a', async () => {
    await delay(30);
    order.push(1);
  });
  const p2 = queues.enqueue('room-a', async () => {
    await delay(5);
    order.push(2);
  });
  const p3 = queues.enqueue('room-a', () => {
    order.push(3);
  });

  await Promise.all([p1, p2, p3]);
  assert.deepEqual(order, [1, 2, 3]);
});

test('不同房间并行执行', async () => {
  const queues = new RoomQueues();
  const order: string[] = [];

  const slow = queues.enqueue('room-slow', async () => {
    await delay(50);
    order.push('slow');
  });
  const fast = queues.enqueue('room-fast', async () => {
    await delay(5);
    order.push('fast');
  });

  await Promise.all([slow, fast]);
  // 若并行，fast 先完成；若被 slow 阻塞则顺序相反
  assert.deepEqual(order, ['fast', 'slow']);
});

test('前一个任务失败不阻塞后续任务', async () => {
  const queues = new RoomQueues();

  const failing = queues.enqueue('room-a', () => {
    throw new Error('boom');
  });
  const following = queues.enqueue('room-a', () => 'ok');

  await assert.rejects(failing, /boom/);
  assert.equal(await following, 'ok');
});

test('任务结果与错误传给正确的调用方', async () => {
  const queues = new RoomQueues();
  const r1 = queues.enqueue('r', () => 41);
  const r2 = queues.enqueue('r', () => 42);
  assert.equal(await r1, 41);
  assert.equal(await r2, 42);
});

test('队列空闲后清理内存', async () => {
  const queues = new RoomQueues();
  await queues.enqueue('room-a', () => 1);
  // 微任务队列排空后应清理
  await delay(1);
  assert.equal(queues.pendingRooms, 0);
});
