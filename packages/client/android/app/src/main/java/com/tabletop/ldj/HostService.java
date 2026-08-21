package com.tabletop.ldj;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.AssetManager;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 内嵌服务器前台服务：把 APK assets 里的 Node 运行时与服务器载荷解压到
 * filesDir 后，以子进程方式执行 server-bundle.cjs（HTTP+WS+SQLite 完整服务端）。
 *
 * 子进程以参数数组形式启动（不经 shell），全部路径由应用私有目录常量派生，
 * 不存在外部输入参与命令构造。实际监听端口以 DATA_DIR/boot.json 为准
 * （8080 被占时服务器自动换端口）。
 */
public class HostService extends Service {

    public static final String TAG = "HostService";
    private static final String CHANNEL_ID = "ldj_host";
    private static final int NOTIFICATION_ID = 1001;
    /** 载荷结构版本：变更后强制重新解压 */
    private static final String PAYLOAD_VERSION = "1";
    private static final int MAX_RESTARTS = 3;

    private static volatile boolean shouldRun = false;
    private static volatile Process nodeProcess = null;

    private Thread bootThread = null;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundCompat();
        synchronized (HostService.class) {
            if (bootThread != null && bootThread.isAlive()) {
                Log.i(TAG, "已在启动中，忽略重复 start");
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
        stopNodeProcess();
        context.stopService(new Intent(context, HostService.class));
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
        String abi = pickAbi();
        if (abi == null) throw new IllegalStateException("设备 ABI 不受支持（需要 arm64-v8a 或 x86_64）");
        File runtime = new File(new File(filesDir, "apphost"), "runtime-" + abi);
        List<String> cmd = new ArrayList<>();
        cmd.add(new File(runtime, "bin/node").getAbsolutePath());
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
        Log.i(TAG, "node 已启动 pid=" + nodeProcess.pid() + " abi=" + abi);
    }

    private static void stopNodeProcess() {
        Process p = nodeProcess;
        nodeProcess = null;
        if (p != null) {
            p.destroy(); // SIGTERM → 服务端优雅停机
            try {
                p.waitFor();
            } catch (InterruptedException e) {
                p.destroyForcibly();
                Thread.currentThread().interrupt();
            }
        }
    }

    /** 设备主 ABI 是否有对应运行时 */
    private String pickAbi() {
        for (String abi : Build.SUPPORTED_ABIS) {
            if ("arm64-v8a".equals(abi) || "x86_64".equals(abi)) {
                if (assetOrFileExists("apphost/runtime-" + abi + "/bin/node")) return abi;
            }
        }
        return null;
    }

    private boolean assetOrFileExists(String relative) {
        File extracted = new File(getFilesDir(), relative);
        if (extracted.exists()) return true;
        try {
            getAssets().open(relative).close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 把 assets/apphost 拷贝到 filesDir/apphost（幂等：marker 版本一致则跳过）。
     * 只解压当前 ABI 的 runtime；client-dist 与 server bundle 全量拷贝。
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
        builder.setContentTitle("聚乐桌主机运行中")
            .setContentText("局域网内玩家可连接加入")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true);
        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= 30) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }
}
