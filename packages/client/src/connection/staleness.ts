/**
 * 陈旧判定（D7-A §6 已知限制的修复）。
 *
 * 背景：开局广播丢失时浏览器可能停在 LOBBY/POST_GAME，而房间实际已 IN_GAME；
 * 现有 resume 看门狗（ConnectionContext 的 stuck 判定）只覆盖 room===null 或
 * IN_GAME+game===null 两种停留态，无法察觉「本地非 IN_GAME、权威已 IN_GAME」的
 * 静默丢广播停留态（客户端无心跳、无法自知陈旧）。
 *
 * 心跳查询返回权威房间状态后，用本函数判定是否需要主动补一次权威恢复（resync）。
 * 纯函数、无 React 依赖，便于独立单元测试。
 */
export function isRoomStatusStale(
  localStatus: string | null | undefined,
  authoritativeStatus: string,
): boolean {
  // 权威已是 IN_GAME 而本地视图不是（含本地无房间视图）→ 静默丢广播，判定为陈旧
  return authoritativeStatus === 'IN_GAME' && localStatus !== 'IN_GAME';
}
