/**
 * 性能采样器（NFR-005/006 服务端指标采集）。
 *
 * 仅当环境变量 PERF_STATS_INTERVAL_MS 为正整数时启用：按间隔向 stdout 打印一行
 * `[perf-stats] rss=<bytes> cpu=<百分比>`，供 perf.mjs 等压测脚本解析。
 * 未设置（或非法）环境变量时零行为，生产启动不受影响。
 */
export function startPerfStats(): (() => void) | null {
  const raw = process.env.PERF_STATS_INTERVAL_MS;
  if (raw === undefined || raw === '') return null;
  const intervalMs = Number(raw);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;

  let lastCpu = process.cpuUsage();
  let lastNs = process.hrtime.bigint();
  const timer = setInterval(() => {
    const nowCpu = process.cpuUsage();
    const nowNs = process.hrtime.bigint();
    const elapsedMs = Number(nowNs - lastNs) / 1e6;
    // process.cpuUsage 返回微秒；差值转毫秒后与墙钟间隔相除得占用百分比
    const cpuMs = (nowCpu.user - lastCpu.user + nowCpu.system - lastCpu.system) / 1000;
    lastCpu = nowCpu;
    lastNs = nowNs;
    const rss = process.memoryUsage().rss;
    const cpuPct = elapsedMs > 0 ? (cpuMs / elapsedMs) * 100 : 0;
    console.log(`[perf-stats] rss=${rss} cpu=${cpuPct.toFixed(2)}`);
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
