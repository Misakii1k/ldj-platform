import fs from 'node:fs';
import { WEREWOLF_VOICE_CATALOG } from '../packages/shared/src/game/werewolfVoiceManifest.ts';
const entries=Object.values(WEREWOLF_VOICE_CATALOG);
const counts=Object.fromEntries(['public','private','unsupported'].map(k=>[k,entries.filter(e=>e.availability===k).length]));
const text=`# 狼人杀音频—场景接入清单\n\n共 ${entries.length} 段：公开 ${counts.public}、涉密禁用 ${counts.private}、未支持规则 ${counts.unsupported}。\n\n- 自动播报由服务端当前公共阶段和已公开结果驱动；人工点播必须通过主持权限、昼夜、角色配置和实际座位校验。\n- 女巫提示采用固定顺序与时间，不读取剩余药物或目标；所有秘密结果及不完整秘密引导句禁止公放。\n- 单死使用完整句；多死使用导语加号码。号码录音只覆盖 1—12，13 号及以上不猜测、不换号。\n- 主持点播默认本机，可选择全房间；自动辅助先暂停，结束不自动恢复。已结算仅允许原主持播报/停止最新局公开录音，不重新结算。\n- 使用方式列标记 75 段自动场景录音及 5 段点播替代录音；80 段安全录音均有主持入口（受阶段和本局席位约束）。\n- 旧存档若缺少可信的房间座位映射，仍可播放非号码提示，号码点播需重新开局，避免误叫号。
- 同类首夜/次夜、单双死按场景择一，不随机叠播。音频测量：node scripts/measure-werewolf-audio.mjs。\n\n| cue | 文件 | 台词/场景 | 使用方式 | 秒 | 说明 |\n|---|---|---|---|---|---|\n`+entries.map(e=>`| ${e.cue} | ${e.file} | ${e.label} | ${e.availability==='public'?(e.automatic?'自动 + 主持点播':'主持点播 / 替代'):(e.availability==='private'?'禁止公放':'保留未接入')} | ${(e.durationMs/1000).toFixed(2)} | ${e.reason} |`).join('\n')+'\n';
fs.writeFileSync('docs/werewolf-voice-coverage.md',text);
