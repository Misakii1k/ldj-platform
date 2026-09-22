/**
 * 钞票飞行的纯函数测试。
 *
 * 只测可判定的性质：落点必须准（否则钞票停在半空）、五种性格必须真的不同、
 * 同叠不能连抽同种、景深必须是先升后落。轨迹好不好看不在这里测。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLIGHT_STYLES,
  buildNotePoses,
  noteStagger,
  pickFlightStyles,
  poseKeyframes,
  shadeKeyframes,
  shadowKeyframes,
  sheenKeyframes,
} from '../src/game/wits-wagers/stage/noteFlight.ts';

const FROM = { x: 100, y: 700, width: 56, height: 30 };
const TO = { x: 220, y: 300, width: 44, height: 24 };

/** 固定序列的伪随机，保证断言可复现 */
function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

function poses(styleIndex: number, index = 0) {
  return buildNotePoses({
    from: FROM,
    to: TO,
    style: FLIGHT_STYLES[styleIndex]!,
    index,
    arc: 80,
    noteWidth: 56,
    noteHeight: 30,
    random: seeded(7 + styleIndex),
  });
}

test('noteFlight: 五种性格都落到目标点，绝不停在半空', () => {
  for (let i = 0; i < FLIGHT_STYLES.length; i += 1) {
    const p = poses(i);
    const last = p[p.length - 1]!;
    // 末帧钉死：中心点必须落在目标中心（含叠内错位 index=0 时为 0）
    assert.equal(last.x + 56 / 2, TO.x + TO.width / 2, `${FLIGHT_STYLES[i]!.name}: 横向未落位`);
    assert.equal(last.y + 30 / 2, TO.y + TO.height / 2, `${FLIGHT_STYLES[i]!.name}: 纵向未落位`);
    assert.equal(last.z, 0, `${FLIGHT_STYLES[i]!.name}: 落地时必须贴桌`);
    assert.equal(last.rotX, 0);
    assert.equal(last.rotY, 0);
    assert.equal(last.rotZ, 0);
    assert.equal(last.lift, 0);
  }
});

test('noteFlight: 起点贴着 from，offset 覆盖完整 0..1', () => {
  for (let i = 0; i < FLIGHT_STYLES.length; i += 1) {
    const p = poses(i);
    assert.equal(p[0]!.offset, 0);
    assert.equal(p[p.length - 1]!.offset, 1);
    // 首帧还在起点附近（允许初始摆动带来的偏移）
    assert.ok(
      Math.abs(p[0]!.x + 28 - (FROM.x + FROM.width / 2)) < 30,
      `${FLIGHT_STYLES[i]!.name}: 起点偏离过大`,
    );
    // offset 必须单调递增，否则 WAAPI 会抛错
    for (let k = 1; k < p.length; k += 1) {
      assert.ok(p[k]!.offset > p[k - 1]!.offset, 'offset 必须严格递增');
    }
  }
});

test('noteFlight: 景深先升后落，最高点确实朝镜头靠近', () => {
  for (let i = 0; i < FLIGHT_STYLES.length; i += 1) {
    const p = poses(i);
    const maxZ = Math.max(...p.map((q) => q.z));
    assert.ok(maxZ > 8, `${FLIGHT_STYLES[i]!.name}: 没有产生景深位移（maxZ=${maxZ}）`);
    // 起点与终点都贴桌
    assert.ok(p[0]!.z < maxZ);
    assert.equal(p[p.length - 1]!.z, 0);
    // z 不能为负（负值会飞到镜头背后）
    assert.ok(p.every((q) => q.z >= 0), '景深位移不得为负');
  }
});

test('noteFlight: 五种性格的轨迹彼此不同', () => {
  const signatures = new Set<string>();
  for (let i = 0; i < FLIGHT_STYLES.length; i += 1) {
    const p = poses(i);
    // 取中段的姿态作为特征：末帧都被钉死了，比不出差别
    const mid = p[Math.floor(p.length / 2)]!;
    signatures.add(
      [mid.x, mid.y, mid.z, mid.rotX, mid.rotY, mid.rotZ].map((v) => v.toFixed(1)).join('|'),
    );
  }
  assert.equal(signatures.size, FLIGHT_STYLES.length, '不同性格不应产生相同轨迹');
});

test('noteFlight: 同一叠里不连续抽到同一种性格', () => {
  for (const seed of [1, 42, 999, 12345]) {
    const styles = pickFlightStyles(12, seeded(seed));
    assert.equal(styles.length, 12);
    for (let i = 1; i < styles.length; i += 1) {
      assert.notEqual(
        styles[i]!.name,
        styles[i - 1]!.name,
        `seed=${seed} 第 ${i} 张与前一张同种`,
      );
    }
  }
});

test('noteFlight: 叠内序号产生落点错位，钞票堆成一小摞而非完全重合', () => {
  const a = poses(0, 0);
  const b = poses(0, 1);
  const lastA = a[a.length - 1]!;
  const lastB = b[b.length - 1]!;
  assert.notEqual(`${lastA.x},${lastA.y}`, `${lastB.x},${lastB.y}`, '同叠不同张应错开落点');
});

test('noteFlight: 错峰间隔随张数收紧，但不会压到 0', () => {
  assert.equal(noteStagger(1000, 600, 1), 0, '只有一张时无需错峰');
  const few = noteStagger(1800, 640, 3);
  const many = noteStagger(1800, 640, 20);
  assert.ok(many < few, '张数越多间隔越小');
  assert.ok(many >= 18, '间隔不得压到 0，否则整叠同时起飞');
  assert.ok(few <= 70, '间隔有上限，否则整叠飞不完');
});

test('noteFlight: 关键帧生成合法的 WAAPI 输入', () => {
  const p = poses(2);
  const kf = poseKeyframes(p);
  assert.equal(kf.length, p.length);
  assert.ok(String(kf[0]!.transform).includes('translate3d'), '必须用 translate3d 才有景深');
  assert.ok(String(kf[0]!.transform).includes('rotateX'));

  // 三条附属轨道的帧数必须与主轨道一致，否则动画时间轴错位
  assert.equal(shadeKeyframes(p).length, p.length);
  assert.equal(sheenKeyframes(p).length, p.length);
  assert.equal(shadowKeyframes(p).length, p.length);

  // 透明度都在合法区间
  for (const frame of [...shadeKeyframes(p), ...sheenKeyframes(p), ...shadowKeyframes(p)]) {
    const o = frame.opacity as number;
    assert.ok(o >= 0 && o <= 1, `透明度越界: ${o}`);
  }
});

test('noteFlight: 阴影贴桌——不跟随抬升，越高越淡越散', () => {
  const p = poses(0);
  const peak = p.reduce((best, q) => (q.lift > best.lift ? q : best), p[0]!);
  const ground = p[p.length - 1]!;
  // 最高点的阴影更淡更大
  const shadows = shadowKeyframes(p);
  const peakShadow = shadows[p.indexOf(peak)]!;
  const groundShadow = shadows[shadows.length - 1]!;
  assert.ok((peakShadow.opacity as number) < (groundShadow.opacity as number), '越高阴影越淡');
  assert.ok(
    String(peakShadow.transform).includes('scale'),
    '阴影要随高度放大',
  );
  // 阴影的纵坐标不该被抬升抵消——它必须留在桌面上
  assert.ok(peak.shadowY > peak.y, '抬升时阴影应留在钞票下方的桌面上');
  assert.ok(Math.abs(ground.shadowY - ground.y) < 40, '落地时阴影应贴合钞票');
});
