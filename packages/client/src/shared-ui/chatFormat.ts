/** 聊天时间戳格式化（HH:MM）——单一实现来源（P1-9，替代 RoomPage.formatTime / GameChatDrawer.formatChatTime）。 */
export function formatChatTime(at: number): string {
  const date = new Date(at);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}
