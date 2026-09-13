package com.tabletop.ldj;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 聚乐桌游 Android 原生应用更新插件。
 *
 * 能力：
 * 1. 获取本机安装版本号（versionName / versionCode）；
 * 2. HTTP/HTTPS 流式下载 APK 到安全 Cache 目录，向前端派发 downloadProgress 进度；
 * 3. 严格安全验签：包名防掉包、签名证书防伪造、版本号防恶意降级；
 * 4. 通过 FileProvider 规范调起系统 PackageInstaller 安装。
 */
@CapacitorPlugin(name = "AppUpdate")
public final class AppUpdatePlugin extends Plugin {

    private static final int BUFFER_SIZE = 8 * 1024;
    private final ExecutorService ioExecutor =
            Executors.newCachedThreadPool(new NamedThreadFactory("tabletop-update-io"));

    /** 获取本机已安装版本信息 */
    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        try {
            Context context = getContext();
            if (context == null) {
                call.reject("Context is null", "CONTEXT_NULL");
                return;
            }
            PackageManager pm = context.getPackageManager();
            PackageInfo info = pm.getPackageInfo(context.getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", info.versionName);
            result.put("versionCode", versionCodeOf(info));
            result.put("packageName", info.packageName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Failed to get installed version: " + error.getMessage(), "GET_VERSION_FAILED");
        }
    }

    /**
     * HTTP/HTTPS 流式下载 APK 到 Cache 目录。
     * 自动处理 301/302/307/308 重定向，并节流发射 downloadProgress 事件。
     */
    @PluginMethod
    public void downloadHttp(PluginCall call) {
        String urlString = call.getString("url");
        String destPath = call.getString("destPath");

        if (urlString == null || urlString.isEmpty()) {
            call.reject("url is required", "INVALID_URL");
            return;
        }
        if (destPath == null || destPath.isEmpty()) {
            call.reject("destPath is required", "INVALID_PATH");
            return;
        }

        File dest = resolveStoragePath(destPath);
        if (dest == null) {
            call.reject("Cannot resolve destPath or path traversal detected: " + destPath, "INVALID_PATH");
            return;
        }
        final String absolutePath = dest.getAbsolutePath();

        ioExecutor.execute(() -> {
            try {
                long bytes = doDownloadHttp(urlString, absolutePath);
                JSObject result = new JSObject();
                result.put("bytes", bytes);
                result.put("destPath", absolutePath);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("APK download failed: " + error.getMessage(), "DOWNLOAD_FAILED");
            }
        });
    }

    private long doDownloadHttp(String initialUrl, String destPath) throws IOException {
        File destFile = new File(destPath);
        File parent = destFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Cannot create parent dir: " + parent.getAbsolutePath());
        }

        String currentUrl = initialUrl;
        HttpURLConnection conn = null;
        int redirects = 0;
        final int MAX_REDIRECTS = 6;

        while (redirects < MAX_REDIRECTS) {
            URL url = new URL(currentUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(60_000);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10; Tabletop-LDJ) AppleWebKit/537.36 Chrome/128.0.0.0");
            conn.setRequestProperty("Accept", "*/*");
            conn.connect();

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == HttpURLConnection.HTTP_SEE_OTHER
                    || code == 307
                    || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) {
                    throw new IOException("HTTP redirect without Location header (code " + code + ")");
                }
                URL base = url;
                currentUrl = new URL(base, loc).toExternalForm();
                redirects++;
                continue;
            }

            if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) {
                conn.disconnect();
                throw new IOException("HTTP error " + code + ": " + conn.getResponseMessage() + " (" + currentUrl + ")");
            }
            break;
        }

        if (redirects >= MAX_REDIRECTS) {
            if (conn != null) conn.disconnect();
            throw new IOException("Too many HTTP redirects");
        }

        long total = conn.getContentLengthLong();
        long received = 0;
        long lastProgressNotify = 0;

        try (InputStream in = conn.getInputStream();
             OutputStream out = new FileOutputStream(destFile)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
                received += read;
                long now = System.currentTimeMillis();
                if (now - lastProgressNotify > 120 || (total > 0 && received == total)) {
                    lastProgressNotify = now;
                    JSObject progress = new JSObject();
                    progress.put("received", received);
                    progress.put("total", total);
                    progress.put("percent", total > 0 ? (int) (received * 100 / total) : 0);
                    notifyListeners("downloadProgress", progress);
                }
            }
            out.flush();
        } catch (IOException error) {
            destFile.delete();
            throw error;
        } finally {
            conn.disconnect();
        }

        if (total > 0 && received != total) {
            destFile.delete();
            throw new IOException("APK download incomplete: expected " + total + " bytes, got " + received);
        }
        return received;
    }

    /**
     * 校验待安装 APK 的合法性与签名安全性。
     */
    @PluginMethod
    public void verifyApk(PluginCall call) {
        String apkPath = call.getString("apkPath");
        if (apkPath == null || apkPath.isEmpty()) {
            call.reject("apkPath is required", "INVALID_PATH");
            return;
        }
        File apk = resolveStoragePath(apkPath);
        if (apk == null || !apk.exists() || !apk.isFile()) {
            call.reject("APK file does not exist or is outside cache directory: " + apkPath, "FILE_NOT_FOUND");
            return;
        }
        Integer expectedVersionCode = call.getInt("expectedVersionCode");
        try {
            PackageInfo archive = verifyApkFile(apk, expectedVersionCode);
            JSObject result = new JSObject();
            result.put("packageName", archive.packageName);
            result.put("versionCode", versionCodeOf(archive));
            result.put("versionName", archive.versionName);
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject(error.getMessage(), "VERIFY_FAILED");
        }
    }

    /** 调起系统安装器安装指定 APK（内部强制复验签名） */
    @PluginMethod
    public void installApk(PluginCall call) {
        String apkPath = call.getString("apkPath");
        if (apkPath == null || apkPath.isEmpty()) {
            call.reject("apkPath is required", "INVALID_PATH");
            return;
        }
        File apk = resolveStoragePath(apkPath);
        if (apk == null || !apk.exists() || !apk.isFile()) {
            call.reject("APK file does not exist or is outside cache directory: " + apkPath, "FILE_NOT_FOUND");
            return;
        }

        try {
            verifyApkFile(apk, call.getInt("expectedVersionCode"));
        } catch (SecurityException error) {
            call.reject(error.getMessage(), "VERIFY_FAILED");
            return;
        }

        try {
            Context context = getContext();
            Intent intent = new Intent(Intent.ACTION_VIEW);
            String mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension("apk");
            if (mimeType == null) mimeType = "application/vnd.android.package-archive";
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
            intent.setDataAndType(uri, mimeType);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            context.startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Failed to start installer: " + error.getMessage(), "INSTALL_FAILED");
        }
    }

    /** 删除 cache 中已安装或废弃的 APK */
    @PluginMethod
    public void deleteApk(PluginCall call) {
        String apkPath = call.getString("apkPath");
        if (apkPath == null || apkPath.isEmpty()) {
            call.reject("apkPath is required", "INVALID_PATH");
            return;
        }
        File apk = resolveStoragePath(apkPath);
        if (apk == null) {
            call.reject("Invalid APK path: must be within application cache directory", "INVALID_PATH");
            return;
        }
        boolean deleted = apk.exists() && apk.delete();
        JSObject result = new JSObject();
        result.put("deleted", deleted);
        call.resolve(result);
    }

    @SuppressWarnings("deprecation")
    private PackageInfo verifyApkFile(File apk, Integer expectedVersionCode) throws SecurityException {
        Context context = getContext();
        if (context == null) throw new SecurityException("无法校验安装包：应用上下文不可用");
        PackageManager pm = context.getPackageManager();

        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;

        PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null) throw new SecurityException("安装包已损坏或不是有效的 APK 格式");

        PackageInfo installed;
        try {
            installed = pm.getPackageInfo(context.getPackageName(), flags);
        } catch (PackageManager.NameNotFoundException error) {
            throw new SecurityException("无法读取本机应用签名，已中止安装");
        }

        // 1. 包名一致性校验
        if (!context.getPackageName().equals(archive.packageName)) {
            throw new SecurityException("安装包的应用包名与本机不符，已拒绝安装");
        }

        // 2. 签名证书一致性校验
        Set<String> archiveCerts = signingDigests(archive);
        Set<String> installedCerts = signingDigests(installed);
        if (archiveCerts.isEmpty() || installedCerts.isEmpty()) {
            throw new SecurityException("安装包缺少有效签名，已中止安装");
        }
        if (!archiveCerts.equals(installedCerts)) {
            throw new SecurityException("安装包的签名与本机应用不一致，已拒绝安装");
        }

        // 3. 版本号递进检查（防回滚降级）
        long archiveCode = versionCodeOf(archive);
        long installedCode = versionCodeOf(installed);
        if (archiveCode < installedCode) {
            throw new SecurityException("安装包版本（" + archiveCode + "）低于当前版本（" + installedCode + "），已拒绝安装");
        }
        if (expectedVersionCode != null && archiveCode != expectedVersionCode.longValue()) {
            throw new SecurityException("安装包版本（" + archiveCode + "）与预期的版本（" + expectedVersionCode + "）不符");
        }

        return archive;
    }

    @SuppressWarnings("deprecation")
    private static Set<String> signingDigests(PackageInfo info) {
        Signature[] signatures = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            SigningInfo signingInfo = info.signingInfo;
            if (signingInfo != null) signatures = signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        Set<String> digests = new HashSet<>();
        if (signatures == null) return digests;
        for (Signature signature : signatures) {
            if (signature == null) continue;
            digests.add(sha256Hex(signature.toByteArray()));
        }
        return digests;
    }

    private static String sha256Hex(byte[] bytes) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(bytes);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02x", b & 0xff));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeOf(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return info.getLongVersionCode();
        return info.versionCode;
    }

    private File resolveStoragePath(String destPath) {
        if (destPath == null || destPath.isEmpty() || destPath.contains("..")) return null;
        try {
            Context context = getContext();
            if (context == null) return null;
            File cacheDir = context.getCacheDir();
            if (cacheDir == null) return null;

            File f = new File(destPath);
            File target = f.isAbsolute() ? f : new File(cacheDir, destPath);
            String canonicalTarget = target.getCanonicalPath();
            String canonicalCache = cacheDir.getCanonicalPath();
            if (!canonicalTarget.equals(canonicalCache) && !canonicalTarget.startsWith(canonicalCache + File.separator)) {
                return null;
            }
            return target;
        } catch (Exception error) {
            return null;
        }
    }

    private static final class NamedThreadFactory implements ThreadFactory {
        private final AtomicInteger counter = new AtomicInteger(1);
        private final String prefix;

        NamedThreadFactory(String prefix) {
            this.prefix = prefix;
        }

        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, prefix + "-" + counter.getAndIncrement());
            t.setDaemon(true);
            return t;
        }
    }
}
