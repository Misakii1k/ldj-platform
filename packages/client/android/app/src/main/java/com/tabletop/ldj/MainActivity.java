package com.tabletop.ldj;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 本地插件须在 super.onCreate 前注册
        registerPlugin(HostServerPlugin.class);
        registerPlugin(NsdDiscoveryPlugin.class);
        registerPlugin(ImmersiveModePlugin.class);
        registerPlugin(SystemTtsPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && ImmersiveModePlugin.isImmersiveActive()) {
            ImmersiveModePlugin.applyImmersive(this, true);
        }
    }
}
