// 裁剪掀盖截图的骰子区域并放大，供视觉复核
import sharp from 'sharp';

const src = 'scratch/shots/smoke-2-lifted.png';
const meta = await sharp(src).metadata();
const w = meta.width ?? 600;
const h = meta.height ?? 600;
// 骰子大致位于截图中部偏下（掀盖后杯体上移，骰子在底盘上）
const cropW = Math.round(w * 0.5);
const cropH = Math.round(h * 0.5);
const left = Math.round((w - cropW) / 2);
const top = Math.round(h * 0.35);
await sharp(src)
  .extract({ left, top, width: cropW, height: cropH })
  .resize(cropW * 2, cropH * 2, { kernel: 'lanczos3' })
  .toFile('scratch/shots/smoke-2-die-zoom.png');
console.log('cropped ->', left, top, cropW, cropH, 'total', w, h);
