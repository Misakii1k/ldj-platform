export type LandlordSuit = 'spades' | 'hearts' | 'clubs' | 'diamonds';
export type LandlordRank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2' | 'SJ' | 'BJ';
export interface LandlordCard { readonly id: string; readonly rank: LandlordRank; readonly suit?: LandlordSuit }
export type ComboType = 'single' | 'pair' | 'triple' | 'triple_single' | 'triple_pair' | 'straight' | 'pair_sequence' | 'bomb' | 'rocket';
export interface LandlordCombo { readonly type: ComboType; readonly mainRank: number; readonly length: number; readonly cards: readonly LandlordCard[] }
const SUITS: readonly LandlordSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
export const RANK_ORDER: readonly LandlordRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'SJ', 'BJ'];
export function rankValue(rank: LandlordRank): number { return RANK_ORDER.indexOf(rank); }
export function buildLandlordDeck(): LandlordCard[] { const deck: LandlordCard[] = []; for (const rank of RANK_ORDER.slice(0, 13)) for (const suit of SUITS) deck.push({ id: `${suit}-${rank}`, rank, suit }); deck.push({ id: 'joker-small', rank: 'SJ' }, { id: 'joker-big', rank: 'BJ' }); return deck; }
export function sortCards(cards: readonly LandlordCard[]): LandlordCard[] { return [...cards].sort((a, b) => rankValue(a.rank) - rankValue(b.rank)); }
function counts(cards: readonly LandlordCard[]): Map<LandlordRank, number> { const m = new Map<LandlordRank, number>(); for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1); return m; }
function isConsecutive(values: readonly number[]): boolean { for (let i = 1; i < values.length; i++) if (values[i] !== values[i - 1]! + 1) return false; return true; }
export function identifyCombo(cards: readonly LandlordCard[]): LandlordCombo | null {
  const sorted = sortCards(cards); const len = sorted.length; if (len === 0) return null;
  const entries = [...counts(sorted).entries()].map(([rank, count]) => ({ value: rankValue(rank), count })).sort((a, b) => a.value - b.value);
  if (len === 1) return { type: 'single', mainRank: entries[0]!.value, length: 1, cards: sorted };
  if (len === 2 && sorted.some((c) => c.rank === 'SJ') && sorted.some((c) => c.rank === 'BJ')) return { type: 'rocket', mainRank: rankValue('BJ'), length: 2, cards: sorted };
  if (len === 2 && entries.length === 1) return { type: 'pair', mainRank: entries[0]!.value, length: 2, cards: sorted };
  if (len === 3 && entries.length === 1) return { type: 'triple', mainRank: entries[0]!.value, length: 3, cards: sorted };
  if (len === 4 && entries.length === 1) return { type: 'bomb', mainRank: entries[0]!.value, length: 4, cards: sorted };
  if (len === 4 && entries.some((e) => e.count === 3)) return { type: 'triple_single', mainRank: entries.find((e) => e.count === 3)!.value, length: 4, cards: sorted };
  if (len === 5 && entries.some((e) => e.count === 3) && entries.some((e) => e.count === 2)) return { type: 'triple_pair', mainRank: entries.find((e) => e.count === 3)!.value, length: 5, cards: sorted };
  if (len >= 5 && entries.length === len && entries.every((e) => e.value < rankValue('2')) && isConsecutive(entries.map((e) => e.value))) return { type: 'straight', mainRank: entries.at(-1)!.value, length: len, cards: sorted };
  if (len >= 6 && len % 2 === 0 && entries.length === len / 2 && entries.every((e) => e.count === 2 && e.value < rankValue('2')) && isConsecutive(entries.map((e) => e.value))) return { type: 'pair_sequence', mainRank: entries.at(-1)!.value, length: len, cards: sorted };
  return null;
}
export function canBeat(candidate: LandlordCombo, current: LandlordCombo | null): boolean { if (!current) return true; if (candidate.type === 'rocket') return current.type !== 'rocket'; if (current.type === 'rocket') return false; if (candidate.type === 'bomb' && current.type !== 'bomb') return true; return candidate.type === current.type && candidate.length === current.length && candidate.mainRank > current.mainRank; }
