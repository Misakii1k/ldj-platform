package com.tabletop.ldj;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 沉浸全屏插件：控制进入游戏时的状态栏隐藏与滑动手势瞬态呼出。
 * 支持 BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE（从屏幕边缘向内滑动唤出状态栏，松手后自动隐退）。
 */
@CapacitorPlugin(name = "ImmersiveMode")
public class ImmersiveModePlugin extends Plugin {

    private static volatile boolean isImmersive = false;

    public static void applyImmersive(Activity activity, boolean enable) {
        if (activity == null) return;
        isImmersive = enable;
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            if (window == null) return;
            View decorView = window.getDecorView();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
                if (controller != null) {
                    if (enable) {
                        WindowCompat.setDecorFitsSystemWindows(window, false);
                        controller.setSystemBarsBehavior(
                            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                        );
                        controller.hide(WindowInsetsCompat.Type.statusBars());
                    } else {
                        WindowCompat.setDecorFitsSystemWindows(window, true);
                        controller.setSystemBarsBehavior(
                            WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
                        );
                        controller.show(WindowInsetsCompat.Type.statusBars());
                        controller.setAppearanceLightStatusBars(true);
                    }
                }
            } else {
                if (enable) {
                    decorView.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    );
                } else {
                    decorView.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                    );
                }
            }
        });
    }

    public static boolean isImmersiveActive() {
        return isImmersive;
    }

    @PluginMethod
    public void enable(PluginCall call) {
        applyImmersive(getActivity(), true);
        JSObject ret = new JSObject();
        ret.put("immersive", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        applyImmersive(getActivity(), false);
        JSObject ret = new JSObject();
        ret.put("immersive", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        Boolean enable = call.getBoolean("enabled", true);
        applyImmersive(getActivity(), Boolean.TRUE.equals(enable));
        JSObject ret = new JSObject();
        ret.put("immersive", enable);
        call.resolve(ret);
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("immersive", isImmersive);
        call.resolve(ret);
    }
}
