// M0 PoC：WebSocket 20 并发连接回显 + 优雅停止；SERVE_ONLY=1 时进入局域网服务模式
// 用法：
//   node ws-poc.mjs                # 自测：20 连接 × 10 消息回显后优雅关闭，退出码 0 = 通过
//   SERVE_ONLY=1 node ws-poc.mjs   # 常驻：打印局域网地址，供其他设备浏览器访问，Ctrl+C 优雅退出
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? 8138);
const SERVE_ONLY = process.env.SERVE_ONLY === '1';

const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<h1>M0 PoC 服务在线</h1><p id="s">WebSocket 连接中……</p>
<script>
  const ws = new WebSocket('ws://' + location.host);
  ws.onopen = () => { ws.send('ping'); };
  ws.onmessage = e => { document.getElementById('s').textContent = 'WebSocket 回显成功：' + e.data; };
  ws.onerror = () => { document.getElementById('s').textContent = 'WebSocket 连接失败'; };
</script>`);
});

const wss = new WebSocketServer({ server: http });
wss.on('connection', (ws) => {
  ws.on('message', (data) => ws.send(data.toString()));
});

await new Promise((resolve, reject) => {
  http.on('error', reject);
  http.listen(PORT, '0.0.0.0', resolve);
});

function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}  (${name})`);
    }
  }
  return out;
}

async function shutdown(code) {
  for (const c of wss.clients) c.terminate();
  await new Promise((r) => wss.close(r));
  await new Promise((r) => http.close(r));
  console.log('已优雅关闭，端口与句柄已释放');
  process.exit(code);
}

if (SERVE_ONLY) {
  console.log('局域网服务模式，其他设备可访问：');
  const list = lanAddresses();
  console.log(list.length ? list.map((s) => `  ${s}`).join('\n') : '  （未检测到局域网 IPv4 地址）');
  console.log(`  http://127.0.0.1:${PORT}  (本机)`);
  console.log('按 Ctrl+C 优雅退出');
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
} else {
  const N = 20;
  const MSGS = 10;
  const clients = await Promise.all(
    Array.from({ length: N }, () => new Promise((resolve, reject) => {
      const c = new WebSocket(`ws://127.0.0.1:${PORT}`);
      c.on('open', () => resolve(c));
      c.on('error', reject);
    })),
  );
  let received = 0;
  await Promise.all(clients.map((c, i) => new Promise((resolve, reject) => {
    let got = 0;
    const timer = setTimeout(() => reject(new Error(`client ${i} 超时`)), 10_000);
    c.on('message', () => {
      received++;
      if (++got === MSGS) { clearTimeout(timer); resolve(); }
    });
    for (let k = 0; k < MSGS; k++) c.send(`m${i}-${k}`);
  }))).catch(async (err) => {
    console.error(`✘ ${err.message}`);
    await shutdown(1);
  });
  console.log(`✔ ${N} 并发连接 × ${MSGS} 消息回显完成，共收到 ${received} 条`);
  for (const c of clients) c.close();
  await shutdown(0);
}
