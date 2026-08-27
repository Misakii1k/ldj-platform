/**
 * 机器人公屏发言清洗：裁到聊天上限，并挡掉最直白的报身份/报验。
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

export function sanitizeBotSpeech(raw: string | null | undefined, fallback: string): string {
  const candidate = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  const picked = looksLikeLeak(candidate) ? fallback : candidate || fallback;
  const parsed = chatTextSchema.safeParse(picked);
  if (parsed.success) return parsed.data;
  const clipped = picked.slice(0, 300).trim();
  const again = chatTextSchema.safeParse(clipped);
  if (again.success) return again.data;
  return '先听大家发言。';
}

function looksLikeLeak(text: string): boolean {
  return LEAK_PATTERNS.some((pattern) => pattern.test(text));
}
