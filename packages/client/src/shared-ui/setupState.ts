import type { GameSetupOption, GameSetupSpec } from '@ldj/shared';

export type SetupConfig = Readonly<Record<string, string | number | boolean | null | undefined>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function accepts(option: GameSetupOption, value: unknown): value is string | number | boolean {
  if (option.kind === 'select') return typeof value === 'string' && option.choices.some((choice) => choice.value === value);
  if (option.kind === 'segmented') return typeof value === 'number' && option.choices.some((choice) => choice.value === value);
  if (option.kind === 'boolean') return typeof value === 'boolean';
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= option.min
    && value <= option.max
    && (value - option.min) % option.step === 0;
}

export function buildSetupConfig(setup: GameSetupSpec): SetupConfig {
  const optionDefaults = Object.fromEntries(setup.options.map((opt) => [opt.key, opt.defaultValue]));
  return { rulesetId: setup.defaultRulesetId, ...optionDefaults, ...setup.defaultConfig };
}

export function applySetupValue(
  setup: GameSetupSpec,
  config: SetupConfig,
  key: string,
  value: unknown,
): SetupConfig {
  if (key === 'rulesetId') {
    if (typeof value !== 'string' || !setup.rulesets.some((ruleset) => ruleset.id === value)) {
      throw new Error('配置值无效');
    }
    return { ...config, rulesetId: value };
  }
  const option = setup.options.find((candidate) => candidate.key === key);
  if (!option) throw new Error('配置项不存在');
  if (!accepts(option, value)) throw new Error('配置值无效');
  return { ...config, [key]: value };
}

export function readRoomGameConfig(setup: GameSetupSpec, roomConfig: unknown): SetupConfig {
  let config = buildSetupConfig(setup);
  if (isRecord(roomConfig)) {
    const rawGameConfig = isRecord(roomConfig.gameConfig) ? roomConfig.gameConfig : roomConfig;
    for (const [key, value] of Object.entries(rawGameConfig)) {
      try {
        config = applySetupValue(setup, config, key, value);
      } catch {
        continue;
      }
    }
  }
  // 兜底：确保所有配置项都有合法的默认值，防止由于未设或坏数据导致 NaN/undefined
  for (const option of setup.options) {
    const val = config[option.key];
    if (val === undefined || (typeof val === 'number' && Number.isNaN(val))) {
      config = { ...config, [option.key]: option.defaultValue };
    }
  }
  return config;
}

export function buildModuleConfig(setup: GameSetupSpec, config: SetupConfig): SetupConfig {
  const allowed = new Set(setup.options.map((option) => option.key));
  if (setup.rulesets.length > 1) allowed.add('rulesetId');
  if ('wolfDelta' in config) allowed.add('wolfDelta');
  return Object.fromEntries(Object.entries(config).filter(([key, val]) => allowed.has(key) && val !== undefined));
}
