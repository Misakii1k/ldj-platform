export interface GameRulesetSpec {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly details?: readonly string[];
}

export interface GameSetupChoice {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export interface GameSetupSelectOption {
  readonly key: string;
  readonly kind: 'select';
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: string;
  readonly choices: readonly GameSetupChoice[];
}

export interface GameSetupIntegerOption {
  readonly key: string;
  readonly kind: 'integer';
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface GameSetupBooleanOption {
  readonly key: string;
  readonly kind: 'boolean';
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: boolean;
}

/** 数值型分段选项：用固定预设替代自由数字输入，避免用户过度调参。 */
export interface GameSetupSegmentedChoice {
  readonly value: number;
  readonly label: string;
}

export interface GameSetupSegmentedOption {
  readonly key: string;
  readonly kind: 'segmented';
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: number;
  readonly choices: readonly GameSetupSegmentedChoice[];
}

export type GameSetupOption =
  | GameSetupSelectOption
  | GameSetupIntegerOption
  | GameSetupBooleanOption
  | GameSetupSegmentedOption;

export interface GameSetupDefinition {
  readonly rulesets: readonly GameRulesetSpec[];
  readonly defaultRulesetId: string;
  readonly options: readonly GameSetupOption[];
}

export interface GameSetupSpec extends GameSetupDefinition {
  readonly defaultConfig: Readonly<Record<string, string | number | boolean>>;
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function copyRuleset(ruleset: GameRulesetSpec): GameRulesetSpec {
  return { ...ruleset };
}

function copyOption(option: GameSetupOption): GameSetupOption {
  if (option.kind === 'select') {
    return { ...option, choices: option.choices.map((choice) => ({ ...choice })) };
  }
  if (option.kind === 'segmented') {
    return { ...option, choices: option.choices.map((choice) => ({ ...choice })) };
  }
  return { ...option };
}

function validateOption(option: GameSetupOption): void {
  if (option.kind === 'select') {
    if (option.choices.length === 0) throw new Error(`配置项 ${option.key} 缺少选项`);
    assertUnique(option.choices.map((choice) => choice.value), `配置项 ${option.key} 的选项值重复`);
    if (!option.choices.some((choice) => choice.value === option.defaultValue)) {
      throw new Error(`配置项 ${option.key} 的默认选项不存在`);
    }
    return;
  }
  if (option.kind === 'segmented') {
    if (option.choices.length === 0) throw new Error(`配置项 ${option.key} 缺少选项`);
    assertUnique(option.choices.map((choice) => String(choice.value)), `配置项 ${option.key} 的选项值重复`);
    if (!option.choices.every((choice) => Number.isInteger(choice.value))) {
      throw new Error(`配置项 ${option.key} 的选项必须使用整数`);
    }
    if (!option.choices.some((choice) => choice.value === option.defaultValue)) {
      throw new Error(`配置项 ${option.key} 的默认选项不存在`);
    }
    return;
  }
  if (option.kind === 'integer') {
    if (![option.defaultValue, option.min, option.max, option.step].every(Number.isInteger)) {
      throw new Error(`配置项 ${option.key} 必须使用整数`);
    }
    if (option.min > option.max || option.step <= 0) {
      throw new Error(`配置项 ${option.key} 的整数范围无效`);
    }
    if (option.defaultValue < option.min || option.defaultValue > option.max) {
      throw new Error(`配置项 ${option.key} 的整数默认值超出范围`);
    }
  }
}

export function createGameSetupSpec(definition: GameSetupDefinition): GameSetupSpec {
  if (definition.rulesets.length === 0) throw new Error('至少需要一个规则集');
  assertUnique(definition.rulesets.map((ruleset) => ruleset.id), '规则集 ID 重复');
  if (!definition.rulesets.some((ruleset) => ruleset.id === definition.defaultRulesetId)) {
    throw new Error('默认规则集不存在');
  }
  assertUnique(definition.options.map((option) => option.key), '配置项 key 重复');
  if (definition.options.some((option) => option.key === 'rulesetId')) {
    throw new Error('配置项 key 不能使用保留字段 rulesetId');
  }
  for (const option of definition.options) validateOption(option);

  const rulesets = definition.rulesets.map(copyRuleset);
  const options = definition.options.map(copyOption);
  const defaultConfig: Record<string, string | number | boolean> = {
    rulesetId: definition.defaultRulesetId,
  };
  for (const option of options) defaultConfig[option.key] = option.defaultValue;

  return {
    rulesets,
    defaultRulesetId: definition.defaultRulesetId,
    options,
    defaultConfig,
  };
}
