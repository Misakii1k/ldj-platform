package com.tabletop.ldj;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 局域网主机自动发现（mDNS / NSD）：
 * 发现服务端广播的 _ldj._tcp 服务并解析出 host:port。
 * NsdManager 同一时刻只允许一个 resolveService，用单线程队列串行化。
 */
@CapacitorPlugin(name = "NsdDiscovery")
public class NsdDiscoveryPlugin extends Plugin {

    private NsdManager nsdManager;
    private NsdManager.DiscoveryListener listener;
    private final List<JSObject> found = new ArrayList<>();
    private final ExecutorService resolveQueue = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void discover(PluginCall call) {
        Context ctx = getContext();
        NsdManager nm = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        if (nm == null) {
            call.reject("此设备不支持 NSD 服务发现");
            return;
        }
        stopDiscovery();
        nsdManager = nm;
        synchronized (found) {
            found.clear();
        }
        String serviceType = call.getString("serviceType", "_ldj._tcp.");
        NsdManager.DiscoveryListener l = new NsdManager.DiscoveryListener() {
            @Override
            public void onStartDiscoveryFailed(String type, int code) {
                notifyListeners("nsd:error", new JSObject());
            }

            @Override
            public void onStopDiscoveryFailed(String type, int code) {
            }

            @Override
            public void onDiscoveryStarted(String type) {
            }

            @Override
            public void onDiscoveryStopped(String type) {
            }

            @Override
            public void onServiceFound(NsdServiceInfo info) {
                resolveQueue.execute(() -> resolve(info));
            }

            @Override
            public void onServiceLost(NsdServiceInfo info) {
                notifyListeners("nsd:lost", new JSObject());
            }
        };
        listener = l;
        try {
            nm.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, l);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (IllegalArgumentException e) {
            listener = null;
            call.reject("发现启动失败：" + e.getMessage());
        }
    }

    private void resolve(NsdServiceInfo info) {
        if (nsdManager == null) return;
        final NsdServiceInfo target = info;
        NsdManager.ResolveListener rl = new NsdManager.ResolveListener() {
            @Override
            public void onResolveFailed(NsdServiceInfo i, int code) {
            }

            @Override
            public void onServiceResolved(NsdServiceInfo i) {
                if (i.getHost() == null) return;
                JSObject ev = new JSObject();
                ev.put("name", i.getServiceName());
                ev.put("host", i.getHost().getHostAddress());
                ev.put("port", i.getPort());
                synchronized (found) {
                    found.add(ev);
                }
                notifyListeners("nsd:found", ev);
            }
        };
        try {
            nsdManager.resolveService(target, rl);
        } catch (IllegalArgumentException e) {
            // 队列串行下不应发生；忽略
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopDiscovery();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray arr = new JSArray();
        synchronized (found) {
            for (JSObject o : found) arr.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("services", arr);
        call.resolve(ret);
    }

    private void stopDiscovery() {
        if (nsdManager != null && listener != null) {
            try {
                nsdManager.stopServiceDiscovery(listener);
            } catch (IllegalArgumentException e) {
                // 未在发现中，忽略
            }
        }
        listener = null;
    }
}
