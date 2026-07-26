export type RoomCommand<T> = () => T | Promise<T>;

/**
 * Serializes commands per room without coupling unrelated rooms. A rejected
 * command is returned to its caller but converted to a fulfilled barrier so it
 * cannot poison later work in the same room.
 */
export class RoomCommandQueue {
  readonly #tails = new Map<string, Promise<void>>();

  enqueue<T>(roomId: string, command: RoomCommand<T>): Promise<T> {
    if (roomId.length === 0) {
      return Promise.reject(new TypeError('roomId must not be empty'));
    }

    const previous = this.#tails.get(roomId) ?? Promise.resolve();
    const result = previous.then(command);
    const barrier = result.then(
      () => undefined,
      () => undefined,
    );

    this.#tails.set(roomId, barrier);
    void barrier.finally(() => {
      if (this.#tails.get(roomId) === barrier) {
        this.#tails.delete(roomId);
      }
    });

    return result;
  }

  get activeRoomCount(): number {
    return this.#tails.size;
  }

  isActive(roomId: string): boolean {
    return this.#tails.has(roomId);
  }

  async waitForIdle(roomId?: string): Promise<void> {
    if (roomId !== undefined) {
      await (this.#tails.get(roomId) ?? Promise.resolve());
      return;
    }

    while (this.#tails.size > 0) {
      await Promise.all([...this.#tails.values()]);
    }
  }
}
