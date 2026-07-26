# 部署与停止

## 源码方式

要求 Node.js 24 LTS 与 npm 11：

```sh
npm ci
npm run build
npm run start:prod
```

服务默认监听 `0.0.0.0:3000`，数据写入当前目录的 `data/`。可通过 `HOST`、`PORT`、
`DATA_DIR`、`PUBLIC_BASE_URL`、`ALLOWED_ORIGINS` 和 `LOG_LEVEL` 调整。

## 安全停止

在服务终端按 Ctrl+C。服务会停止接受新连接，等待当前事务完成，然后关闭 WebSocket、
HTTP 和 SQLite。终端返回后可再次启动；若提示端口占用，应先确认上一次进程是否仍存在，
不要重复启动多个服务实例。

## 局域网排查

- 确认所有设备连接同一 Wi-Fi，且路由器未启用 AP/客户端隔离。
- 在主机防火墙中放行所选 TCP 端口。
- 多网卡时使用终端列出的正确地址，或设置 `PUBLIC_BASE_URL`。
- 房间密码只控制应用层加入，不提供链路加密；不要把局域网端口直接映射到公网。

Termux 真机、锁屏、wake lock、备份和恢复的完整发布说明将在 M5 验收后冻结。
