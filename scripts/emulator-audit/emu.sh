#!/usr/bin/env bash
# 模拟器视觉验收辅助：截图 / 旋转 / 输入
set -euo pipefail
ADB="C:/Android/Sdk/platform-tools/adb.exe"
OUT="D:/项目/screenshots/emulator-audit"
mkdir -p "$OUT"

case "${1:-}" in
  shot)
    # shot <name> [-crop]：全屏截图到 screenshots/emulator-audit/<name>.png
    name="$2"
    "$ADB" exec-out screencap -p > "$OUT/${name}.png"
    echo "saved $OUT/${name}.png"
    ;;
  land)  # 横屏
    "$ADB" shell settings put system accelerometer_rotation 0
    "$ADB" shell settings put system user_rotation 1
    echo "landscape"
    ;;
  port)  # 竖屏
    "$ADB" shell settings put system accelerometer_rotation 0
    "$ADB" shell settings put system user_rotation 0
    echo "portrait"
    ;;
  auto)  # 恢复自动旋转
    "$ADB" shell settings put system accelerometer_rotation 1
    echo "auto-rotate"
    ;;
  tap)
    "$ADB" shell input tap "$2" "$3"
    ;;
  text)
    "$ADB" shell input text "$2"
    ;;
  key)
    "$ADB" shell input keyevent "$2"
    ;;
  dump)
    "$ADB" shell uiautomator dump /sdcard/uidump.xml >/dev/null
    "$ADB" exec-out cat /sdcard/uidump.xml
    ;;
  webview)  # 列出可调试 WebView 目标（CDP）
    "$ADB" forward tcp:9222 localabstract:webview_devtools_remote >/dev/null 2>&1 || \
    "$ADB" forward tcp:9222 localabstract:webview_devtools_remote_"$("$ADB" shell pidof com.tabletop.ldj | tr -d '\r')" >/dev/null
    curl -s http://127.0.0.1:9222/json/list | head -c 2000
    ;;
  *)
    echo "usage: emu.sh shot <name> | land | port | auto | tap x y | text s | key code | dump | webview"
    exit 1
    ;;
esac
