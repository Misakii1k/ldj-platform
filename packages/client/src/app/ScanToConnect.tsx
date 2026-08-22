/**
 * 扫码连接（浏览器与 APP WebView 通用）：
 * getUserMedia 相机流 + jsQR 解码，识别主机二维码（http://IP:端口）后直连。
 * 相机不可用时提示改用手动输入，不阻断连接流程。
 */
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { ScanLine, X } from 'lucide-react';
import { normalizeServerBase } from '../connection/serverAddress.ts';

interface ScanToConnectProps {
  /** 识别到主机地址后回调（由调用方保存并连接） */
  onScanned: (base: string) => void;
  onClose: () => void;
}

export function ScanToConnect({ onScanned, onClose }: ScanToConnectProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState('对准主机屏幕上的入口二维码');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        tick();
      } catch {
        setError('无法访问相机，请改用手动输入主机地址');
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = 320;
        const h = Math.max(1, Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const image = ctx.getImageData(0, 0, w, h);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            const base = normalizeServerBase(code.data);
            if (base) {
              cleanup();
              onScanned(base);
              return;
            }
            setHint('识别到内容但不是主机地址，请对准入口二维码');
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function cleanup() {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    void start();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div className="scan-overlay" role="dialog" aria-label="扫码连接主机">
      <div className="scan-overlay__frame">
        <div className="scan-overlay__head">
          <ScanLine size={16} aria-hidden="true" />
          <span>扫码连接</span>
          <button type="button" className="text-btn scan-overlay__close" onClick={onClose} aria-label="关闭扫码">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error ? (
          <p className="scan-overlay__error" role="alert">{error}</p>
        ) : (
          <>
            <video ref={videoRef} className="scan-overlay__video" playsInline muted />
            <canvas ref={canvasRef} className="scan-overlay__canvas" aria-hidden="true" />
            <p className="scan-overlay__hint">{hint}</p>
          </>
        )}
      </div>
    </div>
  );
}
