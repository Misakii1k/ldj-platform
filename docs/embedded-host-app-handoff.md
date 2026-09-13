# 聚乐桌游 Android APP：内嵌服务器主机模式

> 分支 `feature/embedded-host-app`。一个 APK 三种身份：**玩家 / 桌面 / 主机**。
> 主机模式以内嵌 Node 24 服务器作局域网主机，模拟器（API 35 x86_64）端到端全链路已验证。

## 形态

| 身份 | 说明 |
|------|------|
| 玩家模式 | 手持设备，连接任意主机（手动 IP / 最近主机 / 扫码¹） |
| 桌面模式 | 同玩家连接，全局声明桌面端角色（榴莲/奶酪大盗模拟模式直接以公共大屏呈现） |
| 主机模式 | 前台服务内嵌完整服务器（HTTP+WS+SQLite），本机自动连入，其他设备浏览器/APP 直连 |

¹ 扫码与 mDNS 自动发现的原生端（NsdManager/相机扫码）为后续项；服务端 `_ldj._tcp` mDNS 广播已就绪。

## 架构

```
APK
├── assets/public/                     # Capacitor web 资源（客户端 UI）
├── assets/apphost/                    # 内嵌服务器载荷（sourceSets 额外 assets 源）
│   ├── server-bundle.cjs              # esbuild 单文件服务端（含 ws/zod/bonjour）
│   ├── client-dist/                   # 供浏览器玩家直连的静态页
│   └── runtime-<abi>/lib/             # Termux 依赖库（soname 已物化）
└── lib/<abi>/libldjnode.so            # node 24.18 二进制（jniLibs 方案）
```

**关键机制**

1. **node 经 jniLibs 打包**：targetSdk 29+ 的 W^X/SELinux 策略禁止 exec 应用数据目录（`error=13`）；以 `libldjnode.so` 形式经 jniLibs（`useLegacyPackaging=true`）安装时解压到 `nativeLibraryDir`——唯一允许 exec 的应用自有位置。依赖库从 assets 解压到 filesDir 经 `LD_LIBRARY_PATH` 供 dlopen（mmap-exec 不受限）。
2. **soname 软链物化**：Termux 包的运行时软链（`libz.so.1→libz.so.1.3.2` 等）在 Windows 构建机上解析 tar 列表物化为真实文件，否则 `CANNOT LINK EXECUTABLE`。
3. **boot.json 协议**：服务端监听成功后向 `DATA_DIR/boot.json` 写真实端口与局域网地址（8080 被占自动换端口），原生层与 HostConsole 轮询读取。
4. **跨源连接层**：`serverAddress.ts` 三级解析（运行时覆盖 > 手动配置 > 同源默认）；服务端默认放行 Capacitor WebView 源（`http(s)://localhost`），`/api/*` 对回环来源反射 CORS。
5. **载荷幂等解压**：`filesDir/apphost/.payload-version` marker 控制版本，升级后强制重解压。

## 主机模式流程（实测截图链）

门控三卡 → 主机模式 → HostConsole「正在启动」→（首启解压 ~90MB）→「服务器运行中·端口 8080」+ 入口二维码 + 网络模式徽章（热点/Wi-Fi）→「进入大厅」→ 本机 WebView 连 `127.0.0.1` 进游戏目录 → 其他设备浏览器扫二维码/输 IP 直连同一服务器。

热点场景：Android 无法静默开热点，HostConsole 提供跳转系统设置入口；`lan.ts` 自动识别热点网段并显示「0 流量模式」徽章。

## 一键构建

```bash
npm run build:apk     # client build → server bundle → Termux 运行时抓取/组装 → cap copy → gradle assembleDebug
```

产物：`packages/client/android/app/build/outputs/apk/debug/app-debug.apk`（约 130MB，含双 ABI node 运行时；真机 arm64-only 可后续拆分）。

首次构建会从 `packages.termux.dev` 下载 nodejs-lts 24.18 与依赖库（缓存在 `build/app-host/cache/`）。

## 服务端常规部署不受影响

浏览器同源行为完全不变；mDNS 广播默认开启，`MDNS_DISABLE=1` 关闭。

## 已知遗留

- 原生 NsdManager 发现插件与 APP 内扫码（M4 剩余）：服务端广播已就绪，原生端待做。
- 6 个预存在 e2e 失效（`.room-code` 类名已移除、UNO blocked_rights 状态过时等）：上轮会话遗留，其中 bell-clash/night-testimony 正被并发会话重构，待其收尾后统一修复。
- `styles.css` 含并发会话未提交改动，主机控制台样式已在工作树但暂缓提交。
- Mimosa 门禁会误报拦截含 `Runtime.exec` 的 Java/Kotlin 源码写入（本文件所涉 HostService 经用户授权通道写入）。

## 提交清单

```
12ebe72 feat(host): jniLibs 方案落地，模拟器端到端全链路验证通过
f2a0267 feat(host): 内嵌服务器原生层与主机模式控制台
5c16c84 feat(host): 内嵌服务器载荷链路——boot.json 协议、esbuild 单文件打包与 Termux Node 抓取脚本
6e5ce69 feat(app): APP 身份门控（玩家/桌面）与连接设置
02113fb feat(app): 跨源连接层 serverAddress 与服务端来源放行
53dd1b7 feat(app): Capacitor 安卓壳工程、智能组网引导与 UNO 欢乐房规打磨
```
