package com.tabletop.ldj;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 内嵌服务器桥插件：向 WebView 暴露主机服务的启动/停止/状态与引导动作。
 * 服务详情（真实端口、局域网地址）由 WebView 轮询 /api/network/status 与
 * bootInfo（读 DATA_DIR/boot.json）获得。
 */
@CapacitorPlugin(name = "HostServer")
public class HostServerPlugin extends Plugin {

    private static final int REQ_POST_NOTIFICATIONS = 1001;

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        // Android 13+ 通知权限：前台服务无它也能运行，仅通知不显示；这里尽力请求一次
        if (Build.VERSION.SDK_INT >= 33
            && ActivityCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            && getActivity() != null) {
            ActivityCompat.requestPermissions(
                getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_POST_NOTIFICATIONS);
        }
        Intent intent = new Intent(ctx, HostService.class);
        if (Build.VERSION.SDK_INT >= 26) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        HostService.requestStop(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", HostService.isRunning());
        call.resolve(ret);
    }

    /** 读取 DATA_DIR/boot.json（服务器监听成功后写入的真实端口与入口地址） */
    @PluginMethod
    public void bootInfo(PluginCall call) {
        JSObject ret = new JSObject();
        File boot = new File(new File(getContext().getFilesDir(), "data"), "boot.json");
        if (boot.exists()) {
            try {
                ret.put("boot", new JSONObject(readAll(boot)));
            } catch (Exception e) {
                ret.put("error", "boot.json 解析失败");
            }
        }
        call.resolve(ret);
    }

    /**
     * 枚举设备全部 IPv4 非 loopback 网卡地址（Java NetworkInterface 视角）。
     * 用作 node os.networkInterfaces() 在 Android 上漏检热点网卡时的兜底校验，
     * 让前端能把真实热点 IP 作为二维码候选。
     */
    @PluginMethod
    public void lanAddresses(PluginCall call) {
        JSONArray arr = new JSONArray();
        try {
            Enumeration<NetworkInterface> ifs = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface nif : Collections.list(ifs)) {
                if (nif.isLoopback() || !nif.isUp()) continue;
                Enumeration<java.net.InetAddress> addrs = nif.getInetAddresses();
                for (java.net.InetAddress addr : Collections.list(addrs)) {
                    if (!(addr instanceof Inet4Address)) continue;
                    if (addr.isLoopbackAddress()) continue;
                    JSONObject item = new JSONObject();
                    item.put("interfaceName", nif.getName());
                    item.put("address", addr.getHostAddress());
                    arr.put(item);
                }
            }
        } catch (Exception e) {
            call.reject("枚举网卡失败：" + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("addresses", arr);
        call.resolve(ret);
    }

    /** 跳转系统网络/热点设置（Android 无法静默开热点，只能引导） */
    @PluginMethod
    public void openNetworkSettings(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_WIRELESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开系统设置");
        }
    }

    private static String readAll(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toString("UTF-8");
        }
    }
}
