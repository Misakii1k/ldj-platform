package com.tabletop.ldj;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Android 系统原生 TTS (Text-To-Speech) 插件。
 * 直接调用 Android 本地系统 TTS 引擎（如 Google TTS、小米小爱、华为、三星等），离线零延迟播报。
 */
@CapacitorPlugin(name = "SystemTts")
public class SystemTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {

    private static final String TAG = "SystemTtsPlugin";
    private TextToSpeech tts;
    private boolean isInitialized = false;

    @Override
    public void load() {
        super.load();
        Context context = getContext();
        if (context != null) {
            tts = new TextToSpeech(context.getApplicationContext(), this);
        }
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS && tts != null) {
            int result = tts.setLanguage(Locale.CHINESE);
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
            }
            isInitialized = true;
            Log.i(TAG, "System TextToSpeech initialized successfully");
        } else {
            Log.e(TAG, "Failed to initialize System TextToSpeech, status: " + status);
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            call.resolve();
            return;
        }

        if (!isInitialized || tts == null) {
            JSObject res = new JSObject();
            res.put("success", false);
            res.put("error", "TTS not initialized");
            call.resolve(res);
            return;
        }

        Double rateDouble = call.getDouble("rate", 1.0);
        Double pitchDouble = call.getDouble("pitch", 1.0);
        float rate = rateDouble != null ? rateDouble.floatValue() : 1.0f;
        float pitch = pitchDouble != null ? pitchDouble.floatValue() : 1.0f;
        Boolean interrupt = call.getBoolean("interrupt", true);

        tts.setSpeechRate(rate);
        tts.setPitch(pitch);

        int queueMode = Boolean.TRUE.equals(interrupt) ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;
        String utteranceId = "utt_" + System.currentTimeMillis();
        tts.speak(text, queueMode, null, utteranceId);

        JSObject res = new JSObject();
        res.put("success", true);
        res.put("utteranceId", utteranceId);
        call.resolve(res);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) {
            tts.stop();
        }
        JSObject res = new JSObject();
        res.put("stopped", true);
        call.resolve(res);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject res = new JSObject();
        res.put("available", isInitialized && tts != null);
        call.resolve(res);
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.handleOnDestroy();
    }
}
