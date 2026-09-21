import type { BotDecisionInput } from '@ldj/shared';
import type { WitsWagersPlayerView } from './views.ts';
import type { WitsWagersAction, BoardTarget, TargetId } from './types.ts';
import { MIN_GUESS, MAX_GUESS } from './schemas.ts';

/**
 * 启发式估数：基于题干关键词与单位生成符合常识的正整数。
 * 遵循严格信息隔离架构原则：仅使用公共题干与单位，绝不偷看服务端正确答案。
 */
export function estimateGuess(
  prompt: string,
  unit: string,
  random: BotDecisionInput<unknown>['random'],
): number {
  const p = prompt.toLowerCase();
  const u = unit.toLowerCase();

  // 1. 年份类问题
  if (u.includes('年') || p.includes('哪一年') || p.includes('年份') || p.includes('何时')) {
    if (p.includes('公元前') || p.includes('先秦') || p.includes('古代')) {
      return random.nextInt(200, 1500);
    }
    if (p.includes('新中国') || p.includes('建国') || p.includes('登月') || p.includes('互联网') || p.includes('手机')) {
      return random.nextInt(1950, 2015);
    }
    if (p.includes('近代') || p.includes('鸦片') || p.includes('革命') || p.includes('发明')) {
      return random.nextInt(1820, 1945);
    }
    return random.nextInt(1920, 2020);
  }

  // 2. 长度/高度类
  if (u.includes('毫米') || u.includes('mm')) {
    return random.nextInt(10, 250);
  }
  if (u.includes('厘米') || u.includes('公分') || u.includes('cm')) {
    return random.nextInt(15, 300);
  }
  if (u.includes('千米') || u.includes('公里') || u.includes('km')) {
    if (p.includes('地球') || p.includes('赤道') || p.includes('周长')) {
      return random.nextInt(35000, 45000);
    }
    if (p.includes('长城') || p.includes('长江') || p.includes('黄河') || p.includes('铁路')) {
      return random.nextInt(4000, 10000);
    }
    return random.nextInt(100, 2500);
  }
  if (u.includes('米') || u.includes('公尺') || u === 'm') {
    if (p.includes('珠峰') || p.includes('珠穆朗玛') || p.includes('雪山')) {
      return random.nextInt(8500, 9200);
    }
    if (p.includes('大厦') || p.includes('塔') || p.includes('楼') || p.includes('高楼')) {
      return random.nextInt(300, 650);
    }
    return random.nextInt(30, 800);
  }

  // 3. 重量/质量类
  if (u.includes('克') && !u.includes('千克')) {
    return random.nextInt(50, 1000);
  }
  if (u.includes('公斤') || u.includes('千克') || u.includes('kg')) {
    if (p.includes('大象') || p.includes('鲸') || p.includes('恐龙')) {
      return random.nextInt(3000, 80000);
    }
    return random.nextInt(40, 500);
  }
  if (u.includes('吨')) {
    if (p.includes('航母') || p.includes('轮船') || p.includes('泰坦尼克')) {
      return random.nextInt(30000, 100000);
    }
    return random.nextInt(5, 500);
  }

  // 4. 时间类
  if (u.includes('秒')) {
    return random.nextInt(10, 120);
  }
  if (u.includes('分') && !u.includes('分钟')) {
    return random.nextInt(15, 180);
  }
  if (u.includes('小时')) {
    return random.nextInt(2, 72);
  }
  if (u.includes('天') || u.includes('日')) {
    return random.nextInt(7, 365);
  }

  // 5. 人数/数量大数类
  if (u.includes('万')) {
    return random.nextInt(10, 2000);
  }
  if (u.includes('亿')) {
    return random.nextInt(1, 15);
  }
  if (u.includes('人') || u.includes('名') || u.includes('位')) {
    return random.nextInt(100, 50000);
  }

  // 6. 一般件数/枚/只/部/首
  if (u.includes('个') || u.includes('只') || u.includes('枚') || u.includes('首') || u.includes('部') || u.includes('座')) {
    return random.nextInt(12, 450);
  }

  // 默认正态常识区间
  return random.nextInt(15, 600);
}

/**
 * 挑选下注目标与附加积分。
 * 策略模式：
 * - 筹码 A 押在中位数槽位（胜率最高）；
 * - 筹码 B 押在邻近或高赔率槽位（平衡赔率与风险）；
 * - 积分若充足则对筹码 A 追加微量积分。
 */
export function pickBestBets(
  board: BoardTarget[],
  availableScore: number,
  random: BotDecisionInput<unknown>['random'],
): { targetA: TargetId; stakeA: number; targetB: TargetId; stakeB: number } {
  if (board.length === 0) {
    throw new Error('版图为空，无法生成下注策略');
  }

  // 找到中位数槽位索引
  const midIdx = Math.floor(board.length / 2);
  const targetA = board[midIdx]!.id as TargetId;

  // 筹码 B：75% 选邻近槽位（更稳健），25% 选极端高赔率槽位（博冷门）
  let targetB: TargetId;
  if (random.nextInt(0, 100) < 75) {
    const offset = random.nextInt(0, 2) === 0 ? -1 : 1;
    const neighborIdx = Math.max(0, Math.min(board.length - 1, midIdx + offset));
    targetB = board[neighborIdx]!.id as TargetId;
  } else {
    // 选高赔率槽位（两个边缘槽或版图边缘）
    const highOddsTargets = [...board].sort((a, b) => b.odds - a.odds);
    targetB = highOddsTargets[0]!.id as TargetId;
  }

  // 附加积分分配：若有积分余额，将 0~2 分附加到筹码 A
  let stakeA = 0;
  if (availableScore > 0) {
    const maxStake = Math.min(availableScore, 3);
    stakeA = random.nextInt(0, maxStake + 1);
  }

  return { targetA, stakeA, targetB, stakeB: 0 };
}

/**
 * 《一智千金》规则机器人决策函数。
 */
export function pickWitsWagersBotAction(
  input: BotDecisionInput<WitsWagersPlayerView>,
): WitsWagersAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  if (!me) return null;
  const mySummary = view.players.find((p) => p.playerId === playerId);
  if (mySummary?.forfeited) return null;
  if (view.phase === 'created' || view.phase === 'arranging' || view.phase === 'settlement' || view.phase === 'game_over') {
    return null;
  }

  // 1. 作答阶段：未提交估数时自动提交
  if (view.phase === 'answering') {
    if (!me.canGuess || me.submittedGuess !== null) {
      return null;
    }
    const q = view.question;
    const prompt = q?.prompt ?? '';
    const unit = q?.unit ?? '';
    let val = estimateGuess(prompt, unit, random);
    val = Math.max(MIN_GUESS, Math.min(MAX_GUESS, Math.floor(val)));

    return {
      type: 'submit_guess',
      roundToken: view.roundToken,
      expectedRevision: me.guessRevision,
      value: val,
    };
  }

  // 2. 下注阶段：尚未放置筹码时自动下注
  if (view.phase === 'betting') {
    if (!me.canBet) return null;
    const [chipA, chipB] = me.acceptedBets;
    // 如果两枚筹码已经放置了目标，表示已经下注完毕
    if (chipA.targetId !== null || chipB.targetId !== null) {
      return null;
    }
    if (view.board.length === 0) {
      return null;
    }

    const { targetA, stakeA, targetB, stakeB } = pickBestBets(view.board, me.available, random);

    return {
      type: 'set_bets',
      roundToken: view.roundToken,
      expectedRevision: me.betRevision,
      chips: [
        { chipId: 'A', targetId: targetA, extraStake: stakeA },
        { chipId: 'B', targetId: targetB, extraStake: stakeB },
      ],
    };
  }

  return null;
}
