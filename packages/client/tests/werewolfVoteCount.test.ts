import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBallotQueue } from '../src/game/werewolf/ui/VoteCount.tsx';

describe('狼人杀剧场 W05：唱票队列 buildBallotQueue', () => {
  it('空票型 → 空队列', () => {
    assert.deepEqual(buildBallotQueue({}), []);
    assert.deepEqual(buildBallotQueue({ a: 0, b: 0 }), []);
  });

  it('按得票数升序展开，每票一项，最高票最后落定', () => {
    const queue = buildBallotQueue({ p4: 3, p3: 2, p8: 1 });
    assert.deepEqual(queue, ['p8', 'p3', 'p3', 'p4', 'p4', 'p4']);
  });

  it('同票按席位号升序（提供 seatOrder 时）', () => {
    const seatOrder = new Map([
      ['p9', 9],
      ['p3', 3],
    ]);
    const queue = buildBallotQueue({ p9: 2, p3: 2 }, seatOrder);
    assert.deepEqual(queue, ['p3', 'p3', 'p9', 'p9']);
  });

  it('同票且无席位号时按 id 字典序，保证确定性', () => {
    const queue = buildBallotQueue({ b: 1, a: 1 });
    assert.deepEqual(queue, ['a', 'b']);
  });

  it('票型值不被改动（纯函数）', () => {
    const tally = { x: 2, y: 1 };
    buildBallotQueue(tally);
    assert.deepEqual(tally, { x: 2, y: 1 });
  });
});
