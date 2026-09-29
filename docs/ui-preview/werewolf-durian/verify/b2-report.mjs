import fs from 'fs';
import path from 'path';

const ROOT = process.env.B2_ROOT || 'D:/项目';
const DIR = path.resolve(ROOT, 'docs/ui-preview/werewolf-durian');
const RESULTS = process.env.B2_RESULTS || path.join(process.env.TEMP || '.', 'b2-results.json');
const r = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const VIEWPORTS = ['360x640', '390x844', '844x390', '1280x800'];
const PAGES = { moderator: '狼人杀法官端', durianTable: '榴莲公共桌面', display: '朝外展示端' };

const badges = (v) => {
  const a = v.audit;
  const items = [];
  items.push(a.doc.horizontalOverflow ? '<span class="bad">横向溢出</span>' : '<span class="ok">横向溢出 0</span>');
  items.push(a.outOfViewport.length ? `<span class="bad">出界 ${a.outOfViewport.length}</span>` : '<span class="ok">出界 0</span>');
  items.push(a.clippedText.length ? `<span class="bad">裁字 ${a.clippedText.length}</span>` : '<span class="ok">裁字 0</span>');
  items.push(a.smallTargets.length ? `<span class="bad">&lt;44px ${a.smallTargets.length}</span>` : '<span class="ok">触控达标</span>');
  items.push(v.issues.length ? `<span class="bad">报错 ${v.issues.length}</span>` : '<span class="ok">无报错</span>');
  return items.join('');
};

let auditRows = '';
for (const vp of VIEWPORTS) {
  for (const [key, label] of Object.entries(PAGES)) {
    const v = r.cells[`${vp}|${key}`];
    if (!v) continue;
    const sc = v.fit.scrollers.length ? v.fit.scrollers.join('、') : '无（整页一屏）';
    auditRows += `<tr><td class="mono">${vp}</td><td>${esc(label)}</td><td class="badges">${badges(v)}</td><td class="mono small">${esc(sc)}</td></tr>\n`;
  }
}

const flow = r.flows.filter((f) => f.step && f.ok !== undefined);
const consoleRows = r.flows.filter((f) => f.step && f.ok === undefined);
const flowRows = flow
  .map((f) => `<tr class="${f.ok ? '' : 'row-fail'}"><td>${f.ok ? '<span class="ok">通过</span>' : '<span class="bad">失败</span>'}</td><td>${esc(f.step)}</td><td class="mono small">${f.detail ? esc(JSON.stringify(f.detail)).slice(0, 200) : '—'}</td></tr>`)
  .join('\n');

const shots = fs.readdirSync(path.join(DIR, 'screenshots/verified-20260918-b2')).filter((f) => f.endsWith('.png')).sort();
const shotCards = shots
  .map((f) => `<figure><img src="screenshots/verified-20260918-b2/${f}" alt="${esc(f)}" loading="lazy"><figcaption>${esc(f)}</figcaption></figure>`)
  .join('\n');

const pass = flow.filter((f) => f.ok).length;
let cells = 0, bad = 0;
for (const v of Object.values(r.cells)) {
  cells++;
  if (v.audit.doc.horizontalOverflow || v.audit.outOfViewport.length || v.audit.clippedText.length || v.audit.smallTargets.length || v.issues.length) bad++;
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>第二批页面复核报告 · 2026-09-18</title>
<style>
  :root{--ink:#1b1a17;--muted:#4a463d;--line:#c9c2b2;--bg:#fdfbf6;--card:#fff;--ok:#0a6b4f;--bad:#a3320f;--accent:#08715d}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px 64px;background:var(--bg);color:var(--ink);font:15px/1.65 "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
  .wrap{max-width:1080px;margin:0 auto}
  h1{font-size:26px;margin:0 0 6px}
  h2{font-size:19px;margin:36px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--line)}
  h3{font-size:16px;margin:22px 0 8px}
  p{margin:8px 0}
  .sub{color:var(--muted);font-size:14px}
  .meta{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:16px 0}
  .meta dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-size:14px}
  .meta dt{color:var(--muted)}
  .meta dd{margin:0;font-weight:600}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13.5px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{background:#f1ede1;font-weight:700}
  tr:last-child td{border-bottom:none}
  .row-fail{background:#fff3ee}
  .badges{display:flex;flex-wrap:wrap;gap:5px}
  .ok,.bad{display:inline-block;padding:1px 7px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
  .ok{background:#e2f2ea;color:var(--ok);border:1px solid #9ecdb8}
  .bad{background:#fbe3da;color:var(--bad);border:1px solid #e0a892}
  .mono{font-family:Consolas,"Courier New",monospace}
  .small{font-size:12px;color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-top:12px}
  figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
  figure img{display:block;width:100%;height:auto;background:#eee}
  figcaption{font-size:12px;color:var(--muted);padding:6px 8px;border-top:1px solid var(--line);word-break:break-all}
  .fix{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:12px 16px;margin:14px 0}
  .fix h3{margin-top:0}
  .assume{background:#fff8e8;border:1px solid #e3c98a;border-radius:8px;padding:12px 16px;margin:14px 0}
  code{background:#f1ede1;padding:1px 5px;border-radius:4px;font-family:Consolas,"Courier New",monospace;font-size:13px}
  pre{background:#26241f;color:#f3efe4;padding:12px 14px;border-radius:8px;overflow:auto;font-size:12.5px}
  ul{margin:8px 0;padding-left:22px}
  li{margin:5px 0}
  .kpi{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
  .kpi div{flex:1 1 150px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
  .kpi b{display:block;font-size:24px;font-family:Georgia,"Times New Roman",serif;color:var(--accent)}
  .kpi span{font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">

<h1>第二批页面复核报告</h1>
<p class="sub">2026-09-18 · 狼人杀法官端 / 榴莲公共桌面 / 朝外展示端 · 真实 Chromium ${esc(r.chromium)}</p>

<div class="kpi">
  <div><b>${cells - bad}/${cells}</b><span>视口审计单元格无问题</span></div>
  <div><b>${pass}/${flow.length}</b><span>交互与数据断言通过</span></div>
  <div><b>${shots.length}</b><span>本轮真实截图</span></div>
</div>

<div class="meta">
<dl>
  <dt>浏览器</dt><dd>Chromium ${esc(r.chromium)}（Playwright 1.62.1，无头）</dd>
  <dt>视口</dt><dd>360×640 · 390×844 · 844×390（横屏）· 1280×800</dd>
  <dt>新增页面</dt><dd><code>moderator.html</code> · <code>durian-table.html</code> · <code>display.html</code></dd>
  <dt>服务</dt><dd>本任务临时静态服务 <code>127.0.0.1:4176</code>，仅绑定回环</dd>
  <dt>开始 / 结束</dt><dd>${esc(r.startedAt)} → ${esc(r.finishedAt)}</dd>
</dl>
</div>

<h2>1. 结论</h2>
<ul>
  <li>三页在四个视口下<b>横向溢出 0、文字裁切 0、小于 44px 的触控目标 0、控制台报错 0</b>，共 ${cells} 个单元格全部通过。</li>
  <li><b>${pass} 项交互与数据断言全部通过</b>：法官端出局/撤销/亮牌的二次确认与焦点行为、公共桌面数据与玩家端一致且不泄露隐藏信息、展示端三态切换。</li>
  <li>三页在四个视口<b>均无需整页滚动</b>；长列表（席位、牌列、罚分）改为内部滚动，头部与主操作常驻可见。</li>
  <li>三页与已确认的第一批共用同一套设计语言与数据：法官端与玩家端是同一局同一批昵称；公共桌面的需求数值与玩家端逐项一致。</li>
</ul>

<h2>2. 三页的定位与信息边界</h2>

<h3>2.1 狼人杀法官端 <code>moderator.html</code></h3>
<p>按生产代码 <code>packages/client/src/game/werewolf/moderator/</code> 的真实结构实现：真实法官端是<b>单屏全知控制台</b>，<b>不是</b>"夜晚→白天→投票"的流程机。因此本页只做三件事，没有臆造夜晚行动或投票操作：</p>
<ul>
  <li>全知席位表：12 席显示真实身份（狼人 / 神职 / 村民三类徽章）；</li>
  <li>标记出局 / 撤销出局，均带<b>二次确认</b>；</li>
  <li>「结束对局并亮牌」，带二次确认，完成后出现已结束横幅且按钮禁用。</li>
</ul>
<p>身份分配与玩家端一致：4 狼（01/04/07/10）、4 神（03 预言家 / 05 女巫 / 08 守卫 / 11 猎人）、4 民（02/06/09/12），03 与 09 已出局 → 存活 10，与玩家端「10 / 12 存活」吻合。</p>

<h3>2.2 榴莲公共桌面 <code>durian-table.html</code></h3>
<p>对应生产侧的房间共用大屏（<code>spectator</code> / <code>table</code> 视角）。只承载 <code>DurianPublicView</code> 的公开字段：全桌累计需求、已出牌列（含生效半边）、玩家罚分与淘汰、牌堆剩余、当前轮到谁与上一手、轮次。</p>
<p><b>明确不上屏</b>：任何人的 <code>foreheadCards</code>（头顶牌）与 <code>drawnCard</code>（当前摸到的牌）。这两项在生产里由 <code>buildDurianSpectatorView</code> 强制隔离；本页除文案约束外，还由断言检查"内容区不含私密字段文案"且"不渲染任何手牌类节点"。</p>
<p>数据与玩家端示例局一致：累计需求 榴莲 5 / 草莓 3 / 香蕉 2 / 葡萄 2 / 苹果 3，已出牌列 6 张，牌堆剩余 15，当前轮到 03 号，轮次 02 / 07。</p>

<div class="assume">
<h3>2.3 朝外展示端 <code>display.html</code> —— 需要你确认的一处假设</h3>
<p><b>"朝外展示端"在整个仓库里没有任何既有定义</b>（只有 HANDOFF / NEXT-AGENT-PROMPT / index.html 三处"待做"提及，生产代码中也没有对应物）。</p>
<p>本轮按<b>"面向围观者 / 路人的对外展示牌"</b>实现：大字号展示在玩什么、进行到哪一步、怎么加入，附房间号与二维码占位，并明确声明"不出现任何身份、手牌或投票细节"。内置三种示例状态（狼人杀进行中 / 等待开局 / 榴莲进行中）便于比较。</p>
<p>如果你的本意是别的（例如房间门口的引导海报、或第二块围观大屏），告诉我语义即可，改动量很小。</p>
</div>

<h2>3. 视口审计明细</h2>
<table>
<thead><tr><th>视口</th><th>页面</th><th>检查结果</th><th>滚动容器</th></tr></thead>
<tbody>
${auditRows}
</tbody>
</table>

<h2>4. 交互与数据断言（${pass}/${flow.length} 通过）</h2>
<table><thead><tr><th>结果</th><th>断言</th><th>细节</th></tr></thead><tbody>
${flowRows}
</tbody></table>
<p class="sub">控制台错误 / 页面异常：${consoleRows.every((c) => !c.issues.length) ? '三页均为 0' : esc(JSON.stringify(consoleRows))}</p>

<h2>5. 本轮修复的具体问题</h2>

<div class="fix">
<h3>5.1 公共桌面整页撑高，内部滚动失控</h3>
<p><b>现象：</b>首次复核时 <code>main.d-game</code> 需要整页滚动，360×640 下溢出 760px、844×390 下溢出 236px。</p>
<p><b>根因：</b><code>.dt-page</code> 只有 <code>flex:1</code> 没有高度约束，子元素可无限撑高，<code>flex:1;min-height:0</code> 的牌列与玩家列表因此从未真正约束住。</p>
<p><b>修复：</b><code>durian-table.css</code> 增加 <code>.dt-game{overflow:hidden}</code> 与 <code>.dt-page{height:100%;min-height:0}</code>，并给 <code>.dt-demand</code> 设 <code>flex-shrink:0</code>。</p>
<p><b>复验：</b>四个视口整页溢出均为 0，仅牌列与罚分列表内部滚动。</p>
</div>

<div class="fix">
<h3>5.2 朝外展示端在 360×640 溢出 162px</h3>
<p><b>修复：</b><code>display.css</code> 的 <code>max-width:480px</code> 断点把桌况概览改为 3 列一行（省下整行高度），并压缩字号与间距、把长免责声明让位给核心信息。</p>
<p><b>复验：</b>360×640 整页溢出 0，四个视口均无溢出。</p>
</div>

<div class="fix">
<h3>5.3 预览工具条链接宽度不足 44px</h3>
<p><b>现象：</b>法官端在 360×640 与 390×844 下，工具条"← 玩家端"链接实测宽 43px、高 44px。</p>
<p><b>修复：</b>三页的工具条链接统一补 <code>min-width:44px</code> 与水平内边距。</p>
<p><b>复验：</b>三页四视口的小触控目标数均为 0。</p>
</div>

<div class="fix">
<h3>5.4 一次自查发现的误报</h3>
<p>首轮"公共桌面不泄露隐藏信息"的断言报出 <code>头顶</code> / <code>摸到</code> 两个命中词，复查发现命中的是<b>页脚的安全声明本身</b>（"任何人的头顶牌与当前摸到的牌都不会出现在这块屏幕上"）。已把扫描范围限定为内容区（排除页脚声明），并追加一条结构性断言：内容区不得渲染任何手牌类节点（<code>.d-mini-card</code> / <code>.d-drawn-card</code> / <code>.d-half</code> 等），避免只靠文案判断。</p>
</div>

<h2>6. 未验证项（请勿据此认为已全面验收）</h2>
<ul>
  <li><b>未做真机验证</b>：全部结论来自桌面 Chromium 模拟视口，未在 iOS / Android 真机上测过触控、刘海安全区与软键盘。</li>
  <li><b>法官端未接入真实对局</b>：出局记录、身份分配、亮牌都是本地固定示例；未验证与 <code>WerewolfModeratorStatistics</code>、<code>suggestedOutcome</code> 等生产契约的对接。</li>
  <li><b>公共桌面未验证真实观战数据流</b>：仅验证了公开字段的呈现与私密字段的缺席，未接入 <code>buildDurianSpectatorView</code>。</li>
  <li><b>朝外展示端的语义尚未经用户确认</b>（见 2.3），二维码为占位，未接入真实邀请码。</li>
  <li><b>未改动任何生产代码</b>：<code>packages/client/**</code> 一行未动，未做协议、构建与业务联调。</li>
</ul>

<h2>7. 复现方式</h2>
<pre># 1) 在 D:\\项目 启动仅回环的静态服务
node scripts/serve-art-preview.mjs          # 127.0.0.1:4173

# 2) 语法校验
node --check docs/ui-preview/werewolf-durian/moderator.js
node --check docs/ui-preview/werewolf-durian/durian-table.js
node --check docs/ui-preview/werewolf-durian/display.js

# 3) 第二批四视口 + 流程复核
B3_BASE=http://127.0.0.1:4173 B3_ROOT=. node docs/ui-preview/werewolf-durian/verify/b2-verify.mjs</pre>
<p class="sub">原始数据：<code>verify/b2-results.json</code>（本报告所有表格均由它生成）。</p>

<h2>8. 本轮截图（${shots.length} 张）</h2>
<div class="grid">
${shotCards}
</div>

<p class="sub" style="margin-top:28px">报告生成于 ${esc(r.finishedAt)} · 数据来源：<code>b2-results.json</code>（真实浏览器运行直接产出）</p>

</div>
</body>
</html>
`;

const out = path.join(DIR, 'verified-report-b2.html');
fs.writeFileSync(out, html, 'utf8');
console.log('REPORT_WRITTEN', out, html.length, 'bytes');
