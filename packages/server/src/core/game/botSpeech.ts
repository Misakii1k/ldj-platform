/**
 * 机器人公屏发言清洗：裁到聊天上限；狼人杀允许策略性报身份/报验。
 * 失败时回落套话，避免空消息或把私密身份打到公屏。
 */
import { chatTextSchema } from '@ldj/shared';

const LEAK_PATTERNS = [
  /我是(?:预言家|女巫|守卫|猎人|白痴|狼人|狼)/,
  /我的身份是/,
  /(?:查验|验到|查到).{0,12}(?:狼|好人|神职)/,
  /狼队友|我的狼同伴|我们狼/,
  /解药|毒药|我守的是|我刀的是/,
];

// 只挡明显自曝，不把正常报验、对跳、指控狼人误当成泄密；信息隔离仍靠玩家投影。
const WEREWOLF_LEAK_PATTERNS = [
  /(?:^|[。！？；])\s*我(?:是|的身份是)(?:狼人|狼)(?:[，,。！？；\s]|$)/,
  /我的?狼(?:队友|同伴)|我们狼(?:人)?(?:队|阵营)/,
  /我(?:们)?(?:昨晚|昨夜|今晚)?(?:刀了|刀的是|杀的是)/,
];

export function sanitizeBotSpeech(
  raw: string | null | undefined,
  fallback: string,
  policy: 'conservative' | 'werewolf' = 'conservative',
): string {
  const candidate = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  const patterns = policy === 'werewolf' ? WEREWOLF_LEAK_PATTERNS : LEAK_PATTERNS;
  const picked = patterns.some((pattern) => pattern.test(candidate)) ? fallback : candidate || fallback;
  const parsed = chatTextSchema.safeParse(picked);
  if (parsed.success) return parsed.data;
  const clipped = picked.slice(0, 300).trim();
  const again = chatTextSchema.safeParse(clipped);
  if (again.success) return again.data;
  return '先听大家发言。';
}
