/* 方向稿自检（仅开发时用）：在控制台运行 __check(size, count) 检查席位重叠 / 出界 */
window.__check = async (size, count) => {
  document.querySelector(`[data-set-size="${size}"]`).click();
  document.querySelector(`[data-set-count="${count}"]`).click();
  await new Promise((r) => setTimeout(r, 80));
  const d = document.querySelector('.device');
  const b = d.getBoundingClientRect();
  const k = b.width / d.offsetWidth;
  const R = (el) => { const r = el.getBoundingClientRect(); return { l: (r.left - b.left) / k, t: (r.top - b.top) / k, r: (r.right - b.left) / k, b: (r.bottom - b.top) / k }; };
  const hit = (a, c) => a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1;
  const seats = [...document.querySelectorAll('.seat')].map((s) => ({ no: s.dataset.no, ...R(s) }));
  const others = { speaker: R(document.querySelector('.speaker, .wake, .vcenter, .rcenter, .night-title')), dock: R(document.querySelector('.dock')) };
  document.querySelectorAll('.topbar > *').forEach((el, i) => { others['top' + i] = R(el); });
  const issues = [];
  seats.forEach((s, i) => {
    seats.slice(i + 1).forEach((o) => hit(s, o) && issues.push(`s${s.no}×s${o.no}`));
    Object.entries(others).forEach(([n, o]) => hit(s, o) && issues.push(`s${s.no}×${n}`));
    if (s.l < 0 || s.r > d.offsetWidth || s.t < 0 || s.b > d.offsetHeight) issues.push(`s${s.no} out`);
  });
  const clipped = [...document.querySelectorAll('.seat .name')].filter((n) => n.scrollWidth > n.clientWidth + 1).length;
  return `${size}/${count}: ${issues.join(' ') || 'ok'}${clipped ? ' clipped:' + clipped : ''} | spk ${Math.round(others.speaker.t)}-${Math.round(others.speaker.b)} dock ${Math.round(others.dock.t)}`;
};
window.__checkAll = async () => [await __check('desktop', 12), await __check('desktop', 9), await __check('mobile', 12), await __check('mobile', 9)];
