/**
 * 每房间串行命令队列（SPEC §4.5、§8.1.5）。
 * 同一房间任意时刻最多处理一个命令；不同房间并行；
 * 前一个命令失败不阻塞后续命令。
 */

type Task<T> = () => T | Promise<T>;

export class RoomQueues {
  #tails = new Map<string, Promise<void>>();

  /** 将任务追加到指定房间的串行队列，返回任务自身的结果 */
  enqueue<T>(roomKey: string, task: Task<T>): Promise<T> {
    const tail = this.#tails.get(roomKey) ?? Promise.resolve();
    const run = tail.then(() => task());
    // 队尾吞掉错误，保证后续任务不受影响；错误仍通过 run 传给调用方
    const nextTail = run.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(roomKey, nextTail);
    // 队列空闲后清理，避免已关闭房间残留内存
    void nextTail.then(() => {
      if (this.#tails.get(roomKey) === nextTail) {
        this.#tails.delete(roomKey);
      }
    });
    return run;
  }

  /** 当前有排队任务的房间数（诊断用） */
  get pendingRooms(): number {
    return this.#tails.size;
  }
}
