/**
 * 机器人策略契约（测试用陪练）。
 *
 * 机器人不是第二类玩家：它在 room_members 里是一行普通成员（只多一个 is_bot 标记），
 * 动作照样经 applySessionAction 落库，因此不会绕过任何规则校验或事件流水。
 *
 * 策略函数与 reduce 同样是纯函数：只看自己的玩家视角，返回一个动作或 null。
 * 返回 null 表示"此刻我不该动"，平台不会投递任何动作——这一点很重要，
 * 让状态机自己卡住比让机器人瞎猜更容易暴露真实缺陷。
 */
import type { RandomSource } from './contract.ts';

/** 决策入参：只有该机器人自己的视角，拿不到别人的秘密 */
export interface BotDecisionInput<PV> {
  /** getPlayerView 的产物，与真人客户端收到的完全一致 */
  view: PV;
  playerId: string;
  /** 需要随机时使用；与游戏本身的 RNG 独立，不影响对局可重放性 */
  random: RandomSource;
  /**
   * 近期公屏摘要（平台注入，不含他人私密身份）。
   * 未注入时策略必须仍能工作——旧调用方不会传这个字段。
   */
  recentChat?: readonly BotChatLine[];
}

/** 公屏一行：只给发言者 id 与正文，不含角色或夜间结果 */
export interface BotChatLine {
  fromPlayerId: string | null;
  text: string;
}

/**
 * 机器人策略：返回待投递的动作，或 null 表示当前不行动。
 * 返回的动作仍会过 parseAction 与 reduce，被拒绝是允许的（平台记日志后放过）。
 */
export type BotStrategy<PV, A> = (input: BotDecisionInput<PV>) => A | null;

// —— LLM 决策层 ——

/**
 * 一个可供选择的动作选项。
 *
 * 关键设计：候选动作由游戏模块枚举，大模型只负责"挑一个"，不负责"编一个"。
 * 这样即使模型胡说八道，也不可能产出非法动作——最坏情况是选了个笨招。
 * 同时省掉了让模型学会各游戏动作 JSON 格式的麻烦。
 */
export interface BotActionOption<A> {
  /** 稳定标识，模型回答里引用这个 */
  id: string;
  /** 给模型看的中文说明，例如"出红色 7"、"查验 3 号玩家" */
  label: string;
  /** 选中后实际投递的动作 */
  action: A;
}

/** 模块提供给大模型的完整决策材料 */
export interface BotPromptContext<A> {
  /** 局势描述（自然语言，含自己的手牌/身份等私有信息） */
  situation: string;
  /** 可选动作；为空表示此刻无需行动 */
  options: BotActionOption<A>[];
  /** 该游戏的身份与目标提示，作为系统提示的一部分 */
  roleBrief: string;
  /**
   * 需要模型同时写一段公屏发言时填写。
   * 未声明则模型不必给 speech，平台也不会把理由发到公屏。
   */
  speech?: BotSpeechRequest;
}

/** 发言正文走聊天通道，不进入 reduce */
export interface BotSpeechRequest {
  /** 与 chatTextSchema 上限一致 */
  maxChars: number;
  /** 告诉模型这段话怎么写（禁止报身份、1–2 句等） */
  instruction: string;
}

/**
 * LLM 决策桥：模块把视角翻译成文字与候选项，内核负责调模型并按 id 取回动作。
 * 未实现时该游戏的 LLM 机器人自动退化为规则策略。
 */
export type BotPromptBuilder<PV, A> = (input: BotDecisionInput<PV>) => BotPromptContext<A> | null;

/**
 * 机器人种类：
 * - rule：纯函数策略，零依赖、零延迟、结果可预期，适合跑通流程。
 * - llm：由大模型决策，需要配置外部接口；决策失败时回落到 rule 策略，
 *   保证不会因为网络问题把对局卡死。
 */
export const BOT_KINDS = ['rule', 'llm'] as const;
export type BotKind = (typeof BOT_KINDS)[number];

/** 机器人昵称前缀：便于在成员列表里一眼认出 */
export const BOT_NICKNAME_PREFIX = '机器人';

/** LLM 机器人昵称前缀：和规则机器人区分开，方便对照两者表现 */
export const LLM_BOT_NICKNAME_PREFIX = 'AI';

/** 单个房间的机器人数量上限，防止误点把房间塞满 */
export const MAX_BOTS_PER_ROOM = 11;
