package com.tabletop.ldj;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.AssetManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 内嵌服务器前台服务。
 *
 * node 二进制以 libldjnode.so 形式经 jniLibs 打包，安装时被解压到
 * nativeLibraryDir——targetSdk 29+ 的 W^X 策略禁止 exec 应用数据目录，
 * nativeLibraryDir 是唯一允许 exec 的应用自有位置。
 * 依赖库与服务器载荷从 assets 解压到 filesDir，经 LD_LIBRARY_PATH 供
 * 动态链接器加载（dlopen 的 mmap-exec 不受 exec 限制）。
 *
 * 子进程以参数数组形式启动（不经 shell），路径均由应用私有目录常量派生。
 * 实际监听端口以 DATA_DIR/boot.json 为准（8080 被占时自动换端口）。
 */
public class HostService extends Service {

    public static final String TAG = "HostService";
    private static final String CHANNEL_ID = "ldj_host";
    private static final int NOTIFICATION_ID = 1001;
    /** 载荷结构版本：变更后强制重新解压 */
    private static final String PAYLOAD_VERSION = "3";
    private static final int MAX_RESTARTS = 3;
    private static final String NODE_LIB_NAME = "libldjnode.so";

    private static volatile boolean shouldRun = false;
    private static volatile Process nodeProcess = null;
    private static PowerManager.WakeLock wakeLock = null;
    private static WifiManager.WifiLock wifiLock = null;
    private static WifiManager.MulticastLock multicastLock = null;

    private static volatile Thread bootThread = null;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundCompat();
        acquireLocks();
        synchronized (HostService.class) {
            // 幂等：监控线程存活（含重启休眠期）或 node 进程存活时忽略重复 start，
            // 否则会 spawn 出第二个 node 进程（EADDRINUSE 死掉或被错误跟踪）
            if ((bootThread != null && bootThread.isAlive()) || isRunning()) {
                Log.i(TAG, "已在运行/启动中，忽略重复 start");
                return START_STICKY;
            }
            shouldRun = true;
            bootThread = new Thread(this::boot);
            bootThread.setName("host-boot");
            bootThread.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        // 必须复位 shouldRun：否则 dataSync 时限/system 回收后，仍在跑的监控线程
        // 会在 2 秒后重新拉起孤儿 node 进程（无前台服务、无锁，还会与 START_STICKY 重建竞态）
        shouldRun = false;
        releaseLocks();
        stopNodeProcess();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** 服务是否持有存活的 node 子进程 */
    public static boolean isRunning() {
        Process p = nodeProcess;
        return p != null && p.isAlive();
    }

    /** 停止 node 子进程并结束服务 */
    public static void requestStop(Context context) {
        shouldRun = false;
        releaseLocks();
        stopNodeProcess();
        // 等监控线程确认退出，避免紧随其后的 start() 撞上"已在启动中"被吞掉导致主机不回来
        Thread bt = bootThread;
        if (bt != null && bt != Thread.currentThread()) {
            try {
                bt.join(5000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        context.stopService(new Intent(context, HostService.class));
    }

    private synchronized void acquireLocks() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tabletop:host_service_wakelock");
                    wakeLock.setReferenceCounted(false);
                    wakeLock.acquire();
                    Log.i(TAG, "已获取 Partial WakeLock，保障主机后台暂离持续运行");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "获取 WakeLock 失败: " + e.getMessage());
        }

        try {
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "tabletop:host_service_wifilock");
                    wifiLock.setReferenceCounted(false);
                    wifiLock.acquire();
                    Log.i(TAG, "已获取 WifiLock，保障局域网数据吞吐");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "获取 WifiLock 失败: " + e.getMessage());
        }

        try {
            if (multicastLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    multicastLock = wm.createMulticastLock("tabletop:host_service_multicast");
                    multicastLock.setReferenceCounted(false);
                    multicastLock.acquire();
                    // 无 MulticastLock 时 Wi-Fi 驱动会过滤多播包，mDNS（_ldj._tcp）应答不可达
                    Log.i(TAG, "已获取 MulticastLock，保障 mDNS 多播可达");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "获取 MulticastLock 失败: " + e.getMessage());
        }
    }

    private static synchronized void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                Log.i(TAG, "已释放 WakeLock");
            }
        } catch (Exception ignored) {}
        wakeLock = null;

        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
                Log.i(TAG, "已释放 WifiLock");
            }
        } catch (Exception ignored) {}
        wifiLock = null;

        try {
            if (multicastLock != null && multicastLock.isHeld()) {
                multicastLock.release();
                Log.i(TAG, "已释放 MulticastLock");
            }
        } catch (Exception ignored) {}
        multicastLock = null;
    }

    private void boot() {
        try {
            ensurePayload();
            monitorLoop();
        } catch (Exception e) {
            Log.e(TAG, "启动失败", e);
        }
    }

    /** 监控 node 进程输出并按策略重启 */
    private void monitorLoop() throws Exception {
        int restarts = 0;
        while (shouldRun) {
            spawnNode();
            Process p = nodeProcess;
            if (p == null) break;
            // stderr 必须被排空：node 写满 ~64KB 管道缓冲后会阻塞写入，
            // 进程不退、stdout 不关，监控线程将永远卡在 out.read()
            final InputStream err = p.getErrorStream();
            Thread errPump = new Thread(() -> {
                byte[] ebuf = new byte[4096];
                int m;
                try {
                    while ((m = err.read(ebuf)) > 0) {
                        Log.w(TAG, "[node-stderr] " + new String(ebuf, 0, m).trim());
                    }
                } catch (Exception ignored) {}
            }, "host-node-stderr");
            errPump.setDaemon(true);
            errPump.start();
            try {
                InputStream out = p.getInputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = out.read(buf)) > 0) {
                    Log.i(TAG, new String(buf, 0, n).trim());
                }
                int code = p.waitFor();
                Log.w(TAG, "node 进程退出 code=" + code);
            } catch (Exception e) {
                Log.e(TAG, "监控中断", e);
            }
            if (!shouldRun || restarts >= MAX_RESTARTS) break;
            restarts++;
            Log.i(TAG, "2 秒后重启 node（第 " + restarts + " 次）");
            Thread.sleep(2000);
        }
        Log.i(TAG, "监控结束");
    }

    private void spawnNode() throws Exception {
        File filesDir = getFilesDir();
        File node = new File(getApplicationInfo().nativeLibraryDir, NODE_LIB_NAME);
        if (!node.exists()) throw new IllegalStateException("node 二进制缺失（nativeLibraryDir）：" + node);
        String abi = pickAbi();
        if (abi == null) throw new IllegalStateException("设备 ABI 不受支持（需要 arm64-v8a 或 x86_64）");
        File runtime = new File(new File(filesDir, "apphost"), "runtime-" + abi);
        List<String> cmd = new ArrayList<>();
        cmd.add(node.getAbsolutePath());
        cmd.add(new File(filesDir, "apphost/server-bundle.cjs").getAbsolutePath());
        File dataDir = new File(filesDir, "data");
        dataDir.mkdirs();
        List<String> env = new ArrayList<>();
        env.add(String.format("LD_LIBRARY_PATH=%s", new File(runtime, "lib").getAbsolutePath()));
        env.add(String.format("HOME=%s", filesDir.getAbsolutePath()));
        env.add(String.format("TMPDIR=%s", getCacheDir().getAbsolutePath()));
        env.add("HOST=0.0.0.0");
        env.add("PORT=8080");
        env.add(String.format("DATA_DIR=%s", dataDir.getAbsolutePath()));
        env.add(String.format("CLIENT_DIST_DIR=%s", new File(filesDir, "apphost/client-dist").getAbsolutePath()));
        env.add("NODE_ENV=production");

        // 参数数组直启，不经 shell；路径均为应用私有目录常量派生
        nodeProcess = Runtime.getRuntime().exec(cmd.toArray(new String[0]), env.toArray(new String[0]), filesDir);
        Log.i(TAG, "node 已启动 abi=" + abi);
    }

    private static void stopNodeProcess() {
        Process p = nodeProcess;
        nodeProcess = null;
        if (p == null) return;
        p.destroy(); // SIGTERM → 服务端优雅停机
        // 等待放到后台线程：主线程无上限 waitFor 会触发 ANR（node 优雅停机可能拖秒级）
        Thread waiter = new Thread(() -> {
            try {
                if (!p.waitFor(3, TimeUnit.SECONDS)) {
                    p.destroyForcibly();
                    p.waitFor(1, TimeUnit.SECONDS);
                }
            } catch (InterruptedException e) {
                p.destroyForcibly();
                Thread.currentThread().interrupt();
            }
        }, "host-node-stop");
        waiter.setDaemon(true);
        waiter.start();
    }

    /** 依赖库按 ABI 解压，需与 nativeLibraryDir 实际选中的 ABI 一致 */
    private String pickAbi() {
        for (String abi : Build.SUPPORTED_ABIS) {
            if ("arm64-v8a".equals(abi) || "x86_64".equals(abi)) {
                if (new File(getFilesDir(), "apphost/runtime-" + abi + "/lib").isDirectory()) return abi;
            }
        }
        return null;
    }

    /**
     * 把 assets/apphost 拷贝到 filesDir/apphost（幂等：marker 版本一致则跳过）。
     * 只解压当前 ABI 的依赖库；client-dist 与 server bundle 全量拷贝。
     */
    private void ensurePayload() throws Exception {
        File payloadRoot = new File(getFilesDir(), "apphost");
        File marker = new File(payloadRoot, ".payload-version");
        if (marker.exists() && PAYLOAD_VERSION.equals(readText(marker).trim())) {
            Log.i(TAG, "载荷已是最新，跳过解压");
            return;
        }
        AssetManager assets = getAssets();
        deleteRecursively(payloadRoot);
        payloadRoot.mkdirs();
        copyAssetTree(assets, "apphost/client-dist", new File(payloadRoot, "client-dist"));
        copyAssetTree(assets, "apphost/server-bundle.cjs", new File(payloadRoot, "server-bundle.cjs"));
        String abi = null;
        for (String candidate : Build.SUPPORTED_ABIS) {
            if ("arm64-v8a".equals(candidate) || "x86_64".equals(candidate)) { abi = candidate; break; }
        }
        if (abi == null) throw new IllegalStateException("设备 ABI 不受支持（需要 arm64-v8a 或 x86_64）");
        copyAssetTree(assets, "apphost/runtime-" + abi, new File(payloadRoot, "runtime-" + abi));
        writeText(marker, PAYLOAD_VERSION);
        Log.i(TAG, "载荷解压完成 abi=" + abi);
    }

    private static void copyAssetTree(AssetManager assets, String assetPath, File dest) throws Exception {
        String[] children = assets.list(assetPath);
        if (children == null || children.length == 0) {
            dest.getParentFile().mkdirs();
            try (InputStream in = assets.open(assetPath); OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[256 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return;
        }
        dest.mkdirs();
        for (String child : children) {
            copyAssetTree(assets, assetPath + "/" + child, new File(dest, child));
        }
    }

    private static void deleteRecursively(File f) {
        File[] children = f.listFiles();
        if (children != null) {
            for (File c : children) deleteRecursively(c);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static String readText(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f)) {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toString("UTF-8");
        }
    }

    private static void writeText(File f, String text) throws Exception {
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(text.getBytes("UTF-8"));
        }
    }

    /** Android 15+（targetSdk 35+）：dataSync 前台服务有累计时长配额（约 6h/24h），配额耗尽时系统回调 */
    @Override
    public void onTimeout(int startId, int fgsType) {
        Log.w(TAG, "前台服务 dataSync 时限到达，停止主机服务");
        shouldRun = false;
        releaseLocks();
        stopNodeProcess();
        stopSelf(startId);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "主机服务", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("聚乐桌局域网主机服务运行通知");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void startForegroundCompat() {
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        builder.setContentTitle("聚乐桌主机服务运行中")
            .setContentText("局域网对局服务保持后台运行，其他玩家可正常游玩")
            .setSmallIcon(R.drawable.ic_stat_host)
            .setOngoing(true);
        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= 30) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }
}
